---
layout: post
title: 《深入理解Go语言》读书笔记 - Go 语言混合写屏障的 GC 全场景分析
date: 2025-12-28 17:24:00
categories:
  - 读书笔记
tags:
  - 《深入理解Go语言》
  - Go语言
  - 垃圾回收
  - 写屏障
---

## 第二章 Go 语言混合写屏障的 GC 全场景分析

垃圾回收(Garbage Collection,GC)是编程语言中提供的自动内存管理机制,GC 能够自动释放不需要的内存对象,让出存储器资源,其释放过程中无须程序员手动执行。
GC 机制在现代很多编程语言得到支持,针对 GC 性能的优劣程度,也是不同语言之间的对比指标之一。

Go 语言在 GC 的演进过程中也经历了几次重大改变,如下:

1. Go V1.3之前的STW的标记和清除(SWT Mark Sweep)。
2. Go V1.5的三色并发标记法。“强-弱”三色不变式、插入屏障、删除屏障。
3. Go V1.8混合写屏障机制。

### Go V1.3 标记-清除算法

此算法主要有两个步骤:

1. 标记(Mark Phase)。
2. 清除(Sweep Phase)。

找到需要被清除的内存数据,然后一次性清除。

#### 标记清除(Mark and Sweep)算法的详细过程

1. 暂停程序业务逻辑,对可达和不可达的对象进行分类,然后做上标记。
2. 开始标记。程序找出它所有可达的对象,并做上标记。
3. 标记完了之后,开始清除未标记的对象。
   Mark and Sweep 算法在执行的时候,需要程序暂停,即 STW(Stop The World)。在 STW 的过程中,CPU不执行用户代码,全部用于垃圾回收。
   这个过程影响很大,所以 STW 也是一些回收机制最大的难题和希望优化的点。
4. 停止暂停,让程序继续运行,然后重复这个过程,直到 Process 程序生命周期结束。

#### 标记清除算法的缺点

标记清除算法简单明了,但是也有非常严重的问题:

1. STW 让程序暂停,所以程序会出现卡顿。
2. 标记需要扫描整个 Heap。
3. 清除数据会产生 Heap 碎片。

Go V1.3 版本执行 GC 的基本流程就是首先启动 STW,使程序暂停,然后执行标记,再执行数据回收,最后停止STW。
全部的 GC 时间都是包裹在 STW 范围之内的,Go V1.3 做了简单的优化,将停止 STW 的步骤提前,缩小 STW 暂停的时间范围。
将 Sweep 清除的步骤放到停止 STW 之后执行,因为这些对象已经是不可达对象了,不会出现回收写冲突等问题。

但是无论怎么优化,这个算法都会暂停整个程序。

### Go V1.5 三色标记法

三色标记法 GC 过程和其他用户 Goroutine 可并发运行,但**根对象扫描仍然依赖 STW**,这是该版本 GC 停顿的主要来源。

#### 对象的初始颜色状态

在一次 GC 周期开始时:
堆中所有存活对象在逻辑上均视为“白色”
> 白色表示:当前 GC 轮次中尚未被发现为可达对象

需要注意的是:这里的“程序”并不是一个抽象整体,而是由一组 GC Root 组成,包括:

* 所有 goroutine 的栈
* 全局变量
* runtime 内部引用的对象

从 GC 的视角看,“程序是否可达”本质上等价于“是否能从 Root 出发访问到”。

#### GC 开始:STW 根扫描阶段

##### Stop-The-World(第一次)

在 Go 1.5 中,三色标记开始前必须先进入 STW,原因是:

* goroutine 栈 **不能并发扫描**
* 必须冻结世界,保证 root 集合稳定

##### Root 扫描与初始标记

在 STW 状态下,GC 执行以下操作:

1. 扫描所有 GC Root
2. 将从 Root 直接可达的对象:

    * 从 **白色标记为灰色**
    * 放入 **灰色标记队列(mark queue)**

这一步是:

* **一次性扫描**
* **非递归**
* 仅处理 Root 的第一层可达对象

例如:Root 直接引用对象 1 和对象 4 ,则对象 1、对象 4 被标记为灰色

##### 启用写屏障并恢复世界

Root 扫描完成后:

* 启用 **写屏障(Write Barrier)**
* 恢复用户 goroutine 执行
  GC 进入并发标记阶段

这一阶段的 STW 时间与:goroutine 数量、栈大小 **强相关**

#### 并发三色标记阶段(Concurrent Mark)

##### 灰色对象扫描规则

GC worker 与用户 goroutine **并发运行**,不断执行以下过程:

1. 从灰色标记队列中取出一个灰色对象
2. 扫描该对象的所有指针字段
3. 对每一个被引用的对象:
    * 若为白色 → 标记为灰色,并加入灰色队列
4. 当前灰色对象扫描完成后:
    * 标记为黑色
    * 从灰色集合移动到黑色集合

例如:

* 对象 1、对象 4 初始为灰色
* 扫描对象 1,发现对象 2、对象 7
    * 对象 2、对象 7 由白色 → 灰色
* 对象 1、对象 4 扫描完成后 → 黑色

##### 重复扫描直到灰色集合为空

上述过程不断重复:

* 灰色对象 → 黑色
* 白色对象 → 灰色

直到:

* 灰色标记队列为空
* 所有可达对象均已被访问

此时,内存中的对象只剩下两种颜色:

* **黑色**:从 Root 可达的存活对象
* **白色**:从 Root 不可达的对象(垃圾)

##### 并发正确性的保证:Go 1.5 的写屏障

在并发标记期间,用户程序仍可能修改对象引用关系,例如:

* 黑对象新增指向白对象的引用
* 可能导致白对象被错误回收

为解决该问题,Go 1.5 引入 **写屏障机制**:

在指针写操作时:

* 若新写入的对象尚未被标记
* 则将其标记为灰色

写屏障的作用是:

> **防止在并发标记过程中遗漏任何逻辑上可达的对象**

代价是:

* 每一次指针写入都会增加额外开销
* 写密集型程序在 Go 1.5 中 GC 成本明显偏高

#### 标记结束确认:Mark Termination(STW)

当并发标记完成后,会进行下面的操作。

##### Stop-The-World(第二次)

Go 1.5 会再次进入 STW,用于:

1. 确认灰色队列为空
2. 确保没有遗漏的标记工作
3. 关闭写屏障

这一次 STW 相对较短,但仍然存在。

#### 清除阶段(Sweep)

##### 并发清除白色对象

GC 进入清除阶段:

* 遍历堆中的内存 span
* 回收所有 **白色对象**
* 黑色对象继续存活
* 回收的内存重新进入分配池

清除阶段是 **并发执行的,不再 STW**。

### Go V1.5 的屏障机制

并发标记下的问题本质:三色不变式

在 **并发三色标记阶段**,用户程序(mutator)仍在运行,可能发生:

* 黑对象新增指向白对象的引用
* 灰对象到白对象的可达路径被删除

如果不加限制,会直接导致:**仍被程序使用的对象,被错误回收**

为此,Go 1.5 通过 **三色不变式** 和 **写屏障** 来约束并发行为。

#### 并发标记下的问题本质:三色不变式

##### 强三色不变式

* **不允许黑色对象直接引用白色对象**
* 一旦发生引用:白色对象必须立即转为灰色

特征:

* 安全性强
* 写屏障成本高
* 标记精度高

##### 弱三色不变式

* 允许黑色对象引用白色对象
* 但要求:该白色对象仍然被某个灰色对象间接保护

特征:

* 屏障成本低
* 允许对象“多活一轮”
* 标记精度较低

#### 插入屏障(Insertion Barrier)

* 满足 **强三色不变式**
* 防止黑对象新增指向白对象的引用

当执行指针写入操作:

~~~
A.field = B
~~~

**若:A 为黑色, B 为白色。则将 B 标记为灰色**

> 插入屏障 **仅用于堆对象** **不作用于栈对象**
> 原因:栈写频繁,屏障成本不可接受

> **栈上新增的白色对象引用,无法被插入屏障捕获**

因此,在 Go 1.5 中:

并发标记结束后,**必须对栈进行一次 STW 重新扫描**,以防止栈中仍存在“黑 → 白”的未保护引用

这正是 Go 1.5 **GC 停顿的主要来源之一**。

#### 删除屏障(Deletion Barrier)

* 满足 **弱三色不变式**
* 防止“可达路径被并发删除”

当一个对象引用被删除或覆盖时:

~~~
old = A.field
A.field = nil
~~~

**若 `old` 为白色或灰色:将 `old` 标记为灰色**

> **保证:即使引用被删除或覆盖,原可达对象仍能在本轮 GC 中被扫描**

被删除但已标灰的对象:**可能在本轮 GC 中存活**,只能在下一轮 GC 中回收

> 删除屏障 **牺牲回收精度,换取并发安全性**

### Go V1.8 的混合写屏障

在 Go 1.5 中:

1. 插入屏障 保证强三色不变式,结束阶段必须 STW 重新扫描栈
2. 删除屏障 无需栈 Re-scan ,GC 回收精度低(快照语义)

Go 1.8 引入了混合写屏障机制(Hybrid Write Barrier),避免了对栈 Re-scan(重新扫 描)的过程,这也极大地减少了 STW 的时间,同时结合了插入写屏障和删除写屏障两者的优点

#### 混合写屏障(Hybrid Write Barrier)规则

> **把“栈”在 GC 语义上直接视为“永远安全的黑色区域”,通过“堆上的写屏障 + 初始栈全黑”,同时覆盖插入与删除两种风险。**

1. GC 开始时,一次性 STW 扫描栈。**所有栈可达对象全部标记为黑色,栈对象在整个 GC 期间都被视为安全,不会对栈进行第二次扫描。**
2. GC 期间,栈上新创建的对象直接为黑色。**新对象如果分配在栈上,直接视为黑色。栈对象永远不会成为白色**
3. 堆上“删除引用” → 被删除对象标记为灰色。
4. 堆上“新增引用” → 被新增对象标记为灰色。

混合写屏障实际上满足的是一种变形的弱三色不变式。
> **写屏障只作用于堆的写操作,栈写入永远不出发屏障。**

#### 一些理解上的问题

##### Go 的 GC 回收哪些内存?栈和堆分别由谁管理?

* **GC 只回收堆内存**
* **栈内存不归 GC 管理**

| 内存类型 | 管理者           | 回收方式     |
|------|---------------|----------|
| 栈    | 编译器 + runtime | 函数返回直接回收 |
| 堆    | GC            | 标记-清除    |

栈帧随着函数调用/返回自动创建和销毁,回收成本极低,不适合也不需要 GC 介入。

##### 为什么栈对象“不会被 GC 回收”,却仍然参与 GC?

* **栈对象本身不回收**
* 栈上的指针是 GC 的根(Root Set)
* **堆对象会被栈或全局变量间接引用**

> GC 需要判断 **堆对象** 是否还能被 **栈或全局变量间接引用**,以便确定堆对象是否可以被回收。

##### 混合写屏障带来了什么,代价是什么?

混合写屏障通过 对堆做插入屏障和删除屏障,对栈特殊处理不做屏障。

好处:

* **不会误删仍可达的堆对象**
* 不需要 STW 栈 re-scan,极大缩短 STW 时间
* 栈完全无屏障,极大降低写路径成本

缺点:

* 回收精度降低(延迟回收):不保证本轮 GC 回收所有垃圾,某些对象可能延迟一轮回收
* 内存峰值略有抬高:因为保护对象增多,延迟回收
* 不是严格实时的 GC

### 一些源码

参考 Go 版本为 1.25.5

#### 整体流程

1. gcStart() 是 GC 的入口
2. 防止 GC 在“不安全的执行上下文”(`gp == mp.g0 || mp.locks > 1 || mp.preemptoff != ""`)中启动
    * `gp == mp.g0` 当前在 system stack
    * `mp.locks > 1` 持有 runtime 锁
    * `mp.preemptoff != ""` 明确禁止抢占
3. 补扫 sweep,`sweepone()`,扫描并释放上一轮 GC 未 sweep 完的 span ,保证 heap 状态在 GC 开始前“干净”
4. 获取“GC 启动权”,**防止多个 goroutine 同时启动 GC**
5. STW
    * `stw = stopTheWorldWithSema(stwGCSweepTerm)` 停止所有 P ,停止所有 G ,建立 STW 边界
        * `casGToWaitingForSuspendG(getg().m.curg, _Grunning, waitReasonStoppingTheWorld)` 把“当前发起 STW 的 goroutine”标记为 _Gwaiting。允许 GC mark worker 扫描它的栈,tracer 观察它的状态,GC 和 调度器 的交叉点,防止死锁。
        * `sched.stopwait = gomaxprocs;sched.gcwaiting.Store(true);preemptall()` stopwait=GOMAXPROCS,设置全局 GC 停顿标志,向所有的 P 发起抢占。
        * `for sched.stopwait > 0 { ...` 等待所有 P 停止,周期性抢占(preempt),防止遗漏
        * STW 成功后的校验:统计每个 P 的停顿 CPU 时间,为 GC pause time 记账
        * STW 最终状态:`worldStopped();casgstatus(getg().m.curg, _Gwaiting, _Grunning)`
    * `finishsweep_m()` 确保所有 span 都处于可分配状态,为 mark 阶段准备 heap。**语义上确保上一轮 GC 的 sweep 在 mark 开始前彻底完成**
    * `clearpools()` 清空 sync.Pool,防止池中对象延迟一个 GC 周期回收
6. GC 全局状态初始化
    * `gcController.startCycle(now, int(gomaxprocs), trigger)` 控制 GC 频率,计算 assist 比例,决定 mutator 要“干多少 GC 活”
    * `gcCPULimiter.startGCTransition(true, now)` 控制 GC 占用 CPU 的上限,防止 GC 抢光 mutator CPU
7. 进入 mark 阶段
    * `setGCPhase(_GCmark)` 切换 GC phase(全局语义切换),写屏障将开始生效,三色标记语义正式成立
        * `_GCoff`:本轮 GC 已完成标记,允许 sweep,关闭写屏障
        * `_GCmark`:三色标记生效,写屏障开启,新分配对象直接当作黑色,灰色队列开始 drain
        * `_GCmarktermination`:写屏障仍然开启,所有 P 必须协助 GC,即将切换到 `GCoff`。这是为了**安全地过渡**
    * `gcBgMarkPrepare()` 构造一个“永远不会因为 worker 不够而提前结束 mark 的判定条件”,**它并不启动任何 goroutine,真正启动 mark worker 的地方是 STW 之前的 `gcBgMarkStartWorkers()`**。
    * `gcPrepareMarkRoots()` 准备 root,标记:goroutine 栈、全局变量、runtime roots。为后续 gcMarkRoot 做准备,“栈只扫描一次”的入口就在这之后
      把“本轮 GC 需要扫描的所有 root”,拆分成可并发调度的 root jobs
        * Global Roots(data 已初始化的全局变量 / bss 零值全局变量):**按 block 切分,避免一个巨大 module 的 root 扫描被一个 worker 独占**
        * Span Roots(finalizer specials):带 specials 的 span 主要是:finalizer、weak references(未来)
        * Stack Roots:栈的 root
        * Fixed Roots(runtime 内部):不属于 data/bss、不在任何 goroutine 栈上、但 runtime 必须长期持有、且可能指向堆对象的全局结构(调度器相关结构、所有 goroutine 管理结构、空闲 G / stack 复用池、定时器系统(timer heap)、同步原语等待队列(sudog)等等)。
            * 生命周期 ≈ 程序生命周期
            * 不在用户可见的全局变量中
            * **只能由 runtime 主动扫描**
        * `gcMarkTinyAllocs()` tiny alloc 特殊处理,tinyalloc block 直接置黑,避免分配路径插入额外屏障
        * `atomic.Store(&gcBlackenEnabled, 1)` 分配会“强迫 mutator 帮 GC 干活”
8. 恢复世界,进入并发标记 `now = startTheWorldWithSema(0, stw)` mutator 恢复运行,写屏障开启,并发 mark worker 开始 drain 灰色队列。**GC 的“并发标记阶段”正式开始**
    * `assertWorldStopped();mp := acquirem()` 恢复世界前的准备,保证世界确实是停的、当前 P 不会被抢占,防止 P 错乱
    * `list, delta := netpoll(0);injectglist(&list);netpollAdjustWaiters(delta)` 处理 STW 期间积累的外部事件,是 I/O 与 STW 的边界处理
    * `p1 := procresize(procs);sched.gcwaiting.Store(false)` 重新建立 P 的规模与归属关系,处理 GOMAXPROCS 变化、清除 gcwaiting 、唤醒 sysmon(如果需要)
    * 把 P 重新交还给 M(或创建新 M),是调度恢复的核心
    * `sched.stwTotalTimeGC.record(...);trace.STWDone()` 记录 STW 总耗时和 trace
    * `wakep()` 唤醒调度系统,防止 runnable G 堆积 、P 全部 idle

> 可以发现,这里的 gcStart 流程只是为 GC 进行环境的准备,保证上一次 GC 完全结束,并且拿到所有的 root。
> 真正的标记阶段是 gcStart 启动的异步的,在 STW 之后才开始的。
> 并且这里没有真正的对白色对象进行清理。
>
> **Go GC 的“清理阶段(Sweep)”不在 gcStart 里作为一个完整阶段出现,是因为:Sweep 是「跨 GC 周期、并发 + 增量」执行的,而不是一个集中、封闭的阶段。**
> gcStart 中会有一部分清理(sweepone 和 finishsweep_m),但**真正的大部分清理工作是在 GC mark 结束之后,下一轮 GC 开始之前,且与 mutator 并发执行的。**

真正清理阶段:

1. Sweep 的入口:`gcMarkTermination()`
2. Sweep 的执行:`sweepone() / sweepLocked()`,**Sweep 不是一个统一的 loop,而是被“顺便”触发的**。
    * 分配内存
    * 后台 sweep goroutine
    * 下一轮 GC 启动前
    * heap 不足
3. 后台 sweep worker,Go 有专门的后台 sweep worker:在 GC 结束后启动,与 mutator 并发,慢慢把 span 扫干净。`bgsweep() / sweepone()`

#### 源码参考

入口:`gcStart()`:go1.25.5/src/runtime/mgc.go:643

~~~go
// gcStart starts the GC. It transitions from _GCoff to _GCmark (if
// debug.gcstoptheworld == 0) or performs all of GC (if
// debug.gcstoptheworld != 0).
//
// This may return without performing this transition in some cases,
// such as when called on a system stack or with locks held.
func gcStart(trigger gcTrigger) {
	// Since this is called from malloc and malloc is called in
	// the guts of a number of libraries that might be holding
	// locks, don't attempt to start GC in non-preemptible or
	// potentially unstable situations.
	mp := acquirem()
	if gp := getg(); gp == mp.g0 || mp.locks > 1 || mp.preemptoff != "" {
		releasem(mp)
		return
	}
	releasem(mp)
	mp = nil

	if gp := getg(); gp.bubble != nil {
		// Disassociate the G from its synctest bubble while allocating.
		// This is less elegant than incrementing the group's active count,
		// but avoids any contamination between GC and synctest.
		bubble := gp.bubble
		gp.bubble = nil
		defer func() {
			gp.bubble = bubble
		}()
	}

	// Pick up the remaining unswept/not being swept spans concurrently
	//
	// This shouldn't happen if we're being invoked in background
	// mode since proportional sweep should have just finished
	// sweeping everything, but rounding errors, etc, may leave a
	// few spans unswept. In forced mode, this is necessary since
	// GC can be forced at any point in the sweeping cycle.
	//
	// We check the transition condition continuously here in case
	// this G gets delayed in to the next GC cycle.
	for trigger.test() && sweepone() != ^uintptr(0) {
	}

	// Perform GC initialization and the sweep termination
	// transition.
	semacquire(&work.startSema)
	// Re-check transition condition under transition lock.
	if !trigger.test() {
		semrelease(&work.startSema)
		return
	}

	// In gcstoptheworld debug mode, upgrade the mode accordingly.
	// We do this after re-checking the transition condition so
	// that multiple goroutines that detect the heap trigger don't
	// start multiple STW GCs.
	mode := gcBackgroundMode
	if debug.gcstoptheworld == 1 {
		mode = gcForceMode
	} else if debug.gcstoptheworld == 2 {
		mode = gcForceBlockMode
	}

	// Ok, we're doing it! Stop everybody else
	semacquire(&gcsema)
	semacquire(&worldsema)

	// For stats, check if this GC was forced by the user.
	// Update it under gcsema to avoid gctrace getting wrong values.
	work.userForced = trigger.kind == gcTriggerCycle

	trace := traceAcquire()
	if trace.ok() {
		trace.GCStart()
		traceRelease(trace)
	}

	// Check that all Ps have finished deferred mcache flushes.
	for _, p := range allp {
		if fg := p.mcache.flushGen.Load(); fg != mheap_.sweepgen {
			println("runtime: p", p.id, "flushGen", fg, "!= sweepgen", mheap_.sweepgen)
			throw("p mcache not flushed")
		}
		// Initialize ptrBuf if necessary.
		if goexperiment.GreenTeaGC && p.gcw.ptrBuf == nil {
			p.gcw.ptrBuf = (*[gc.PageSize / goarch.PtrSize]uintptr)(persistentalloc(gc.PageSize, goarch.PtrSize, &memstats.gcMiscSys))
		}
	}

	gcBgMarkStartWorkers()

	systemstack(gcResetMarkState)

	work.stwprocs, work.maxprocs = gomaxprocs, gomaxprocs
	if work.stwprocs > numCPUStartup {
		// This is used to compute CPU time of the STW phases, so it
		// can't be more than the CPU count, even if GOMAXPROCS is.
		work.stwprocs = numCPUStartup
	}
	work.heap0 = gcController.heapLive.Load()
	work.pauseNS = 0
	work.mode = mode

	now := nanotime()
	work.tSweepTerm = now
	var stw worldStop
	systemstack(func() {
		stw = stopTheWorldWithSema(stwGCSweepTerm)
	})

	// Accumulate fine-grained stopping time.
	work.cpuStats.accumulateGCPauseTime(stw.stoppingCPUTime, 1)

	// Finish sweep before we start concurrent scan.
	systemstack(func() {
		finishsweep_m()
	})

	// clearpools before we start the GC. If we wait the memory will not be
	// reclaimed until the next GC cycle.
	clearpools()

	work.cycles.Add(1)

	// Assists and workers can start the moment we start
	// the world.
	gcController.startCycle(now, int(gomaxprocs), trigger)

	// Notify the CPU limiter that assists may begin.
	gcCPULimiter.startGCTransition(true, now)

	// In STW mode, disable scheduling of user Gs. This may also
	// disable scheduling of this goroutine, so it may block as
	// soon as we start the world again.
	if mode != gcBackgroundMode {
		schedEnableUser(false)
	}

	// Enter concurrent mark phase and enable
	// write barriers.
	//
	// Because the world is stopped, all Ps will
	// observe that write barriers are enabled by
	// the time we start the world and begin
	// scanning.
	//
	// Write barriers must be enabled before assists are
	// enabled because they must be enabled before
	// any non-leaf heap objects are marked. Since
	// allocations are blocked until assists can
	// happen, we want to enable assists as early as
	// possible.
	setGCPhase(_GCmark)

	gcBgMarkPrepare() // Must happen before assists are enabled.
	gcPrepareMarkRoots()

	// Mark all active tinyalloc blocks. Since we're
	// allocating from these, they need to be black like
	// other allocations. The alternative is to blacken
	// the tiny block on every allocation from it, which
	// would slow down the tiny allocator.
	gcMarkTinyAllocs()

	// At this point all Ps have enabled the write
	// barrier, thus maintaining the no white to
	// black invariant. Enable mutator assists to
	// put back-pressure on fast allocating
	// mutators.
	atomic.Store(&gcBlackenEnabled, 1)

	// In STW mode, we could block the instant systemstack
	// returns, so make sure we're not preemptible.
	mp = acquirem()

	// Update the CPU stats pause time.
	//
	// Use maxprocs instead of stwprocs here because the total time
	// computed in the CPU stats is based on maxprocs, and we want them
	// to be comparable.
	work.cpuStats.accumulateGCPauseTime(nanotime()-stw.finishedStopping, work.maxprocs)

	// Concurrent mark.
	systemstack(func() {
		now = startTheWorldWithSema(0, stw)
		work.pauseNS += now - stw.startedStopping
		work.tMark = now

		// Release the CPU limiter.
		gcCPULimiter.finishGCTransition(now)
	})

	// Release the world sema before Gosched() in STW mode
	// because we will need to reacquire it later but before
	// this goroutine becomes runnable again, and we could
	// self-deadlock otherwise.
	semrelease(&worldsema)
	releasem(mp)

	// Make sure we block instead of returning to user code
	// in STW mode.
	if mode != gcBackgroundMode {
		Gosched()
	}

	semrelease(&work.startSema)
}
~~~

`setGCPhase(_GCmark)` 切换 GC phase(全局语义切换):go1.25.5/src/runtime/mgc.go:255

~~~go
// Garbage collector phase.
// Indicates to write barrier and synchronization task to perform.
var gcphase uint32

// The compiler knows about this variable.
// If you change it, you must change builtin/runtime.go, too.
// If you change the first four bytes, you must also change the write
// barrier insertion code.
//
// writeBarrier should be an internal detail,
// but widely used packages access it using linkname.
// Notable members of the hall of shame include:
//   - github.com/bytedance/sonic
//
// Do not remove or change the type signature.
// See go.dev/issue/67401.
//
//go:linkname writeBarrier
var writeBarrier struct {
	enabled bool    // compiler emits a check of this before calling write barrier
	pad     [3]byte // compiler uses 32-bit load for "enabled" field
	alignme uint64  // guarantee alignment so that compiler can use a 32 or 64-bit load
}

const (
	_GCoff             = iota // GC not running; sweeping in background, write barrier disabled
	_GCmark                   // GC marking roots and workbufs: allocate black, write barrier ENABLED
	_GCmarktermination        // GC mark termination: allocate black, P's help GC, write barrier ENABLED
)

//go:nosplit
func setGCPhase(x uint32) {
	atomic.Store(&gcphase, x)
	writeBarrier.enabled = gcphase == _GCmark || gcphase == _GCmarktermination
}
~~~

`gcBgMarkPrepare`:go1.25.5/src/runtime/mgc.go:1393

~~~go
// gcBgMarkPrepare sets up state for background marking.
// Mutator assists must not yet be enabled.
func gcBgMarkPrepare() {
	// Background marking will stop when the work queues are empty
	// and there are no more workers (note that, since this is
	// concurrent, this may be a transient state, but mark
	// termination will clean it up). Between background workers
	// and assists, we don't really know how many workers there
	// will be, so we pretend to have an arbitrarily large number
	// of workers, almost all of which are "waiting". While a
	// worker is working it decrements nwait. If nproc == nwait,
	// there are no workers.
	work.nproc = ^uint32(0)
	work.nwait = ^uint32(0)
}
~~~

`gcPrepareMarkRoots`:go1.25.5/src/runtime/mgcmark.go:60

~~~go
// gcPrepareMarkRoots queues root scanning jobs (stacks, globals, and
// some miscellany) and initializes scanning-related state.
//
// The world must be stopped.
func gcPrepareMarkRoots() {
	assertWorldStopped()

	// Compute how many data and BSS root blocks there are.
	nBlocks := func(bytes uintptr) int {
		return int(divRoundUp(bytes, rootBlockBytes))
	}

	work.nDataRoots = 0
	work.nBSSRoots = 0

	// Scan globals.
	for _, datap := range activeModules() {
		nDataRoots := nBlocks(datap.edata - datap.data)
		if nDataRoots > work.nDataRoots {
			work.nDataRoots = nDataRoots
		}

		nBSSRoots := nBlocks(datap.ebss - datap.bss)
		if nBSSRoots > work.nBSSRoots {
			work.nBSSRoots = nBSSRoots
		}
	}

	// Scan span roots for finalizer specials.
	//
	// We depend on addfinalizer to mark objects that get
	// finalizers after root marking.
	//
	// We're going to scan the whole heap (that was available at the time the
	// mark phase started, i.e. markArenas) for in-use spans which have specials.
	//
	// Break up the work into arenas, and further into chunks.
	//
	// Snapshot heapArenas as markArenas. This snapshot is safe because heapArenas
	// is append-only.
	mheap_.markArenas = mheap_.heapArenas[:len(mheap_.heapArenas):len(mheap_.heapArenas)]
	work.nSpanRoots = len(mheap_.markArenas) * (pagesPerArena / pagesPerSpanRoot)

	// Scan stacks.
	//
	// Gs may be created after this point, but it's okay that we
	// ignore them because they begin life without any roots, so
	// there's nothing to scan, and any roots they create during
	// the concurrent phase will be caught by the write barrier.
	work.stackRoots = allGsSnapshot()
	work.nStackRoots = len(work.stackRoots)

	work.markrootNext = 0
	work.markrootJobs = uint32(fixedRootCount + work.nDataRoots + work.nBSSRoots + work.nSpanRoots + work.nStackRoots)

	// Calculate base indexes of each root type
	work.baseData = uint32(fixedRootCount)
	work.baseBSS = work.baseData + uint32(work.nDataRoots)
	work.baseSpans = work.baseBSS + uint32(work.nBSSRoots)
	work.baseStacks = work.baseSpans + uint32(work.nSpanRoots)
	work.baseEnd = work.baseStacks + uint32(work.nStackRoots)
}
~~~

`stopTheWorldWithSema(reason stwReason)`:go1.25.5/src/runtime/proc.go:1617
`startTheWorldWithSema(now int64, w worldStop)`:go1.25.5/src/runtime/proc.go:1763

~~~go
// stopTheWorldWithSema is the core implementation of stopTheWorld.
// The caller is responsible for acquiring worldsema and disabling
// preemption first and then should stopTheWorldWithSema on the system
// stack:
//
//	semacquire(&worldsema, 0)
//	m.preemptoff = "reason"
//	var stw worldStop
//	systemstack(func() {
//		stw = stopTheWorldWithSema(reason)
//	})
//
// When finished, the caller must either call startTheWorld or undo
// these three operations separately:
//
//	m.preemptoff = ""
//	systemstack(func() {
//		now = startTheWorldWithSema(stw)
//	})
//	semrelease(&worldsema)
//
// It is allowed to acquire worldsema once and then execute multiple
// startTheWorldWithSema/stopTheWorldWithSema pairs.
// Other P's are able to execute between successive calls to
// startTheWorldWithSema and stopTheWorldWithSema.
// Holding worldsema causes any other goroutines invoking
// stopTheWorld to block.
//
// Returns the STW context. When starting the world, this context must be
// passed to startTheWorldWithSema.
//
//go:systemstack
func stopTheWorldWithSema(reason stwReason) worldStop {
	// Mark the goroutine which called stopTheWorld preemptible so its
	// stack may be scanned by the GC or observed by the execution tracer.
	//
	// This lets a mark worker scan us or the execution tracer take our
	// stack while we try to stop the world since otherwise we could get
	// in a mutual preemption deadlock.
	//
	// We must not modify anything on the G stack because a stack shrink
	// may occur, now that we switched to _Gwaiting, specifically if we're
	// doing this during the mark phase (mark termination excepted, since
	// we know that stack scanning is done by that point). A stack shrink
	// is otherwise OK though because in order to return from this function
	// (and to leave the system stack) we must have preempted all
	// goroutines, including any attempting to scan our stack, in which
	// case, any stack shrinking will have already completed by the time we
	// exit.
	//
	// N.B. The execution tracer is not aware of this status transition and
	// andles it specially based on the wait reason.
	casGToWaitingForSuspendG(getg().m.curg, _Grunning, waitReasonStoppingTheWorld)

	trace := traceAcquire()
	if trace.ok() {
		trace.STWStart(reason)
		traceRelease(trace)
	}
	gp := getg()

	// If we hold a lock, then we won't be able to stop another M
	// that is blocked trying to acquire the lock.
	if gp.m.locks > 0 {
		throw("stopTheWorld: holding locks")
	}

	lock(&sched.lock)
	start := nanotime() // exclude time waiting for sched.lock from start and total time metrics.
	sched.stopwait = gomaxprocs
	sched.gcwaiting.Store(true)
	preemptall()
	// stop current P
	gp.m.p.ptr().status = _Pgcstop // Pgcstop is only diagnostic.
	gp.m.p.ptr().gcStopTime = start
	sched.stopwait--
	// try to retake all P's in Psyscall status
	trace = traceAcquire()
	for _, pp := range allp {
		s := pp.status
		if s == _Psyscall && atomic.Cas(&pp.status, s, _Pgcstop) {
			if trace.ok() {
				trace.ProcSteal(pp, false)
			}
			pp.syscalltick++
			pp.gcStopTime = nanotime()
			sched.stopwait--
		}
	}
	if trace.ok() {
		traceRelease(trace)
	}

	// stop idle P's
	now := nanotime()
	for {
		pp, _ := pidleget(now)
		if pp == nil {
			break
		}
		pp.status = _Pgcstop
		pp.gcStopTime = nanotime()
		sched.stopwait--
	}
	wait := sched.stopwait > 0
	unlock(&sched.lock)

	// wait for remaining P's to stop voluntarily
	if wait {
		for {
			// wait for 100us, then try to re-preempt in case of any races
			if notetsleep(&sched.stopnote, 100*1000) {
				noteclear(&sched.stopnote)
				break
			}
			preemptall()
		}
	}

	finish := nanotime()
	startTime := finish - start
	if reason.isGC() {
		sched.stwStoppingTimeGC.record(startTime)
	} else {
		sched.stwStoppingTimeOther.record(startTime)
	}

	// Double-check we actually stopped everything, and all the invariants hold.
	// Also accumulate all the time spent by each P in _Pgcstop up to the point
	// where everything was stopped. This will be accumulated into the total pause
	// CPU time by the caller.
	stoppingCPUTime := int64(0)
	bad := ""
	if sched.stopwait != 0 {
		bad = "stopTheWorld: not stopped (stopwait != 0)"
	} else {
		for _, pp := range allp {
			if pp.status != _Pgcstop {
				bad = "stopTheWorld: not stopped (status != _Pgcstop)"
			}
			if pp.gcStopTime == 0 && bad == "" {
				bad = "stopTheWorld: broken CPU time accounting"
			}
			stoppingCPUTime += finish - pp.gcStopTime
			pp.gcStopTime = 0
		}
	}
	if freezing.Load() {
		// Some other thread is panicking. This can cause the
		// sanity checks above to fail if the panic happens in
		// the signal handler on a stopped thread. Either way,
		// we should halt this thread.
		lock(&deadlock)
		lock(&deadlock)
	}
	if bad != "" {
		throw(bad)
	}

	worldStopped()

	// Switch back to _Grunning, now that the world is stopped.
	casgstatus(getg().m.curg, _Gwaiting, _Grunning)

	return worldStop{
		reason:           reason,
		startedStopping:  start,
		finishedStopping: finish,
		stoppingCPUTime:  stoppingCPUTime,
	}
}

// reason is the same STW reason passed to stopTheWorld. start is the start
// time returned by stopTheWorld.
//
// now is the current time; prefer to pass 0 to capture a fresh timestamp.
//
// stattTheWorldWithSema returns now.
func startTheWorldWithSema(now int64, w worldStop) int64 {
	assertWorldStopped()

	mp := acquirem() // disable preemption because it can be holding p in a local var
	if netpollinited() {
		list, delta := netpoll(0) // non-blocking
		injectglist(&list)
		netpollAdjustWaiters(delta)
	}
	lock(&sched.lock)

	procs := gomaxprocs
	if newprocs != 0 {
		procs = newprocs
		newprocs = 0
	}
	p1 := procresize(procs)
	sched.gcwaiting.Store(false)
	if sched.sysmonwait.Load() {
		sched.sysmonwait.Store(false)
		notewakeup(&sched.sysmonnote)
	}
	unlock(&sched.lock)

	worldStarted()

	for p1 != nil {
		p := p1
		p1 = p1.link.ptr()
		if p.m != 0 {
			mp := p.m.ptr()
			p.m = 0
			if mp.nextp != 0 {
				throw("startTheWorld: inconsistent mp->nextp")
			}
			mp.nextp.set(p)
			notewakeup(&mp.park)
		} else {
			// Start M to run P.  Do not start another M below.
			newm(nil, p, -1)
		}
	}

	// Capture start-the-world time before doing clean-up tasks.
	if now == 0 {
		now = nanotime()
	}
	totalTime := now - w.startedStopping
	if w.reason.isGC() {
		sched.stwTotalTimeGC.record(totalTime)
	} else {
		sched.stwTotalTimeOther.record(totalTime)
	}
	trace := traceAcquire()
	if trace.ok() {
		trace.STWDone()
		traceRelease(trace)
	}

	// Wakeup an additional proc in case we have excessive runnable goroutines
	// in local queues or in the global queue. If we don't, the proc will park itself.
	// If we have lots of excessive work, resetspinning will unpark additional procs as necessary.
	wakep()

	releasem(mp)

	return now
}
~~~