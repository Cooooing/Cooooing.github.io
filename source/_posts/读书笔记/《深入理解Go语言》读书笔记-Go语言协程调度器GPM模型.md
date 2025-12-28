---
layout: post
title: 《深入理解Go语言》读书笔记 - Go 语言协程调度器 GPM 模型
date: 2025-12-27 14:33:28
categories:
  - 读书笔记
tags:
  - 《深入理解Go语言》
  - Go
  - GPM
---

## 前言

想深入下 Go 的底层,主要是并发模型、GC和内存管理相关内容。

刘丹冰老师的这本书分为3篇21章
第一篇(1~4章)主要讲 GMP 模型、GC、内存管理和 IO 复用并发模型,是比较核心的内容,会详细阅读。
第二篇(5~12章)主要讲 Go 语言特性和一些进阶知识,会选择性地详细阅读。
第三篇(13~21章)主要是项目实战,通过 Zinx 框架了解 TCP/IP 网络服务器架构,这篇大概率会跳过。

## 第一章 深入理解 Go 语言协程调度器 GPM 模型

### 调度器由来

#### 单进程时代不需要调度器

单进程时代过于久远,现在应该不会有这样的系统了,估计只存在于计算机组成原理的课上了。

单一的执行流程,计算机只能一个任务一个任务处理,所有的程序都是阻塞的。
因为在一个进程的完整生命周期中,所需要访问的物理部分包括 CPU、Cache、主内存、磁盘、网络等。
**不同的硬件媒介处理计算的能力相差甚大,可能几个数量级。如果将这些处理速度不同的处理媒介通过一个进程串在一起,则会出现高速度媒介等待和浪费的现象。**
如当一个程序加载一个磁盘数据的时候,在读写的过程中,CPU处于等待状态,那么对于单进程的操作系统来讲,很明显会造成CPU运算能力的浪费,因为CPU此刻本应该被合理地分配到其他进程上去做高层的计算。

#### 多进程/多线程时代的调度器

当一个进程阻塞 CPU 可以立刻切换到其他进程中去执行,而且调度CPU的算法可以保证在运行的进程都可以被分配到CPU的运行时间片。从宏观来看,似乎多个进程是在同时被运行。

> 时间片(Timeslice)又称为“量子(Quantum)”或“处理器片(Processor Slice)”
> 是分时操作系统分配给每个正在运行的进程微观上的一段CPU时间(在抢占内核中是从进程开始运行直到被抢占的时间)。

![多线程多进程执行顺序.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/多线程多进程执行顺序.png)

这是会带来新的问题,当进程越来越多,每个进程又拥有太多的资源时,进程的创建、切换、销毁都会占用很多 CPU 性能。
即进程切换和调度带来的性能消耗可能会超过进程本身的性能消耗,这时候就很不划算了。

![CPU调度切换的成本.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/CPU调度切换的成本.png)

#### 协程提供 CPU 利用率

一个线程可以分为“内核态”和“用户态”两种形态的线程。
所谓**用户态线程就是把内核态的线程在用户态实现了一遍而已**,目的是更轻量化(更少的内存占用、更少的隔离、更快的调度)和更高的可控性(可以自己控制调度器)。
用户态中的所有东⻄内核态都看得⻅,只是对于内核而言用户态线程只是一堆内存数据而已。

一个用户态线程必须绑定一个内核态线程,但是CPU并不知道有用户态线程的存在,它只知道它运行的是一个内核态线程(Linux的PCB进程控制块)。
如果将线程再进行细化,内核线程依然叫线程(Thread),而用户线程则叫协程(Co-routine)。操作系统层面的线程就是所谓的内核态线程,用户态线程则多种多样,只要能满足在同一个内核线程上执行多个任务,例如Co-routine、Go的Goroutine、C#的Task等。

协程和线程的映射关系有三种,它们分别是 N:1 关系、1:1 关系和 M:N 关系。

1. N:1 关系
   N个协程绑定1个线程,优点就是协程在用户态线程即完成切换,不会陷入内核态,这种切换非常轻量快速,但缺点也很明显。1个进程的所有协程都绑定在1个线程上。
   这种情况下,**单个程序只能利用一个核,即使是多核CPU**;**某一个协程阻塞,会造成线程阻塞,本进程的其他协程都无法执行了,进而导致没有任何并发能力**。
2. 1:1 关系
   1个协程绑定1个线程,这种方式最容易实现。协程的调度都由CPU完成了,和直接使用线程没有太大区别。
3. M:N 关系
   M个协程绑定1个线程,实现起来最为复杂。同一个调度器上挂载M个协程,调度器下游则是多个CPU核心资源。
   协程跟线程是有区别的,线程由CPU调度是抢占式的,协程由用户态调度是协作式的,一个协程让出CPU后,才执行下一个协程,所以针对M:N模型的中间层的调度器设计就变得尤为重要,提高线程和协程的绑定关系和执行效率也变为不同语言在设计调度器时的优先目标。

#### Go 语言的协程 Goroutine

Go语言为了提供更容易使用的并发方法,使用了Goroutine和Channel。
Goroutine来自协程的概念,让一组可复用的函数运行在一组线程之上,即使有协程阻塞,该线程的其他协程也可以被 runtime 调度,从而转移到其他可运行的线程上。
Goroutine的特点,占用内存更小(几KB)和调度更灵活(runtime调度)。

#### 被废弃的 Goroutine 调度器

Go 的调度器在 2012 年重新设计了。

> G 表示 Goroutine
> M 表示 线程

早期的调度器是基于 M:N 的基础上实现的。
所有的协程(G)都会被放在一个全局的Go协程队列中,在全局队列的外面由于是多个 M 的共享资源,所以会加上一个用于同步及互斥作用的锁。
M 想要执行、放回 G 都必须访问全局 G 队列,并且 M 有多个,即多线程访问同一资源需要加锁进行保证互斥/同步,所以全局 G 队列是由互斥锁进行保护的。

**这会带来激烈的锁竞争**,因为创建、销毁、调度 G 都需要每个 M 获取锁。
**M 转移 G 会造成延迟和额外的系统负载**。例如当 G 中包含创建新协程的时候,M 创建了 G′,为了继续执行 G,需要把 G′ 交给 M2 执行,**也造成了很差的局部性(共享数据、共享栈索引、可能访问相同内存)**,因为 G′ 和 G 是相关的,最好放在M上执行,而不是其他 M2。
系统调用(CPU在M之间的切换)导致频繁的线程阻塞和取消阻塞操作增加了系统开销。

### Go语言调度器GPM模型的设计思想

面对之前调度器的问题,新的调度器引入了 P (处理器)。
处理器包含了运行 Goroutine 的资源,如果线程想运行 Goroutine,必须先获取 P,P 中还包含了可运行的 G 队列。

#### GPM 模型

在Go中,线程是运行 Goroutine 的实体,调度器的功能是把可运行的 Goroutine 分配到工作线程上。

![GPM模型.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/GPM模型.png)

1. **全局队列(Global Queue):存放等待运行的 G**。
   全局队列可能被任意的 P 去获取里面的 G,所以全局队列相当于整个模型中的全局资源,那么自然对于队列的读写操作是要加入互斥动作的。
2. **P 的本地队列:同全局队列类似,存放的也是等待运行的 G,但存放的数量有限,不超过 256 个**。
   新建 G′ 时,G′ 优先加入 P 的本地队列,如果队列满了,则会把本地队列中一半的 G 移动到全局队列。
3. **P 列表:所有的 P 都在程序启动时创建,并保存在数组中,最多有 GOMAXPROCS(可配置)个**。
4. **M:线程想运行任务就得获取 P,从 P 的本地队列获取 G**,当 P 队列为空时,M 也会尝试从全局队列获得一批 G 放到 P 的本地队列,或从其他P的本地队列“偷”一半放到自己 P 的本地队列(工作窃取)。
   M 运行 G,G 执行之后,M 会从 P 获取下一个 G,不断重复下去。

Goroutine 调度器和 OS 调度器是通过 M 结合起来的,每个 M 都代表了 1 个内核线程,OS调度器负责把内核线程分配到 CPU 的核上执行。

##### 有关 P 和 M 个数的问题

P 的数量由启动时环境变量 $GOMAXPROCS 或者由 runtime 的方法 GOMAXPROCS() 决定。
这意味着在程序执行的任意时刻都只有 $GOMAXPROCS 个 Goroutine 在同时运行。(真正的并行,CPU 核心的数量)

~~~go
package runtime

// GOMAXPROCS sets the maximum number of CPUs that can be executing
// simultaneously and returns the previous setting. It defaults to
// the value of [runtime.NumCPU]. If n < 1, it does not change the current setting.
// This call will go away when the scheduler improves.
func GOMAXPROCS(n int) int {
	if GOARCH == "wasm" && n > 1 {
		n = 1 // WebAssembly has no threads yet, so only one CPU is possible.
	}

	lock(&sched.lock)
	ret := int(gomaxprocs)
	unlock(&sched.lock)
	if n <= 0 || n == ret {
		return ret
	}

	stw := stopTheWorldGC(stwGOMAXPROCS)

	// newprocs will be processed by startTheWorld
	newprocs = int32(n)

	startTheWorldGC(stw)
	return ret
}

~~~

M 的数量由 Go 语言本身的限制决定,Go 程序启动时会设置 M 的最大数量,默认为 10000 个,但是内核很难支持这么多的线程数,所以这个限制可以忽略。
runtime/debug 中的 SetMaxThreads() 函数可设置 M 的最大数量,当一个 M 阻塞了时会创建新的 M。

~~~go
package runtime

// SetMaxThreads sets the maximum number of operating system
// threads that the Go program can use. If it attempts to use more than
// this many, the program crashes.
// SetMaxThreads returns the previous setting.
// The initial setting is 10,000 threads.
//
// The limit controls the number of operating system threads, not the number
// of goroutines. A Go program creates a new thread only when a goroutine
// is ready to run but all the existing threads are blocked in system calls, cgo calls,
// or are locked to other goroutines due to use of runtime.LockOSThread.
//
// SetMaxThreads is useful mainly for limiting the damage done by
// programs that create an unbounded number of threads. The idea is
// to take down the program before it takes down the operating system.
func SetMaxThreads(threads int) int {
	return setMaxThreads(threads)
}

~~~

M 与 P 的数量没有绝对关系,一个 M 阻塞,P 就会去创建或者切换另一个 M,所以,即使 P 的默认数量是 1,也有可能会创建很多个 M 出来。

##### 有关 P 和 M 何时被创建

1. P 创建的时机在确定了 P 的最大数量 n 后,运行时系统会根据这个数量创建 n 个 P。
2. M 创建的时机是在当没有足够的 M 来关联 P 并运行其中可运行的 G 的时候。
   例如所有的 M 此时都阻塞住了,而 P 中还有很多就绪任务,就会去寻找空闲的 M,如果此时没有空闲的 M,就会去创建新的 M。

#### 调度器的设计策略

##### 复用线程

避免频繁地创建、销毁线程,而是对线程的复用。

1. 偷取(Work Stealing)机制
   当本线程无可运行的 G 时,尝试从其他线程绑定的 P 偷取 G,而不是销毁线程。
   ![偷取机制.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/偷取机制.png)
   偷取的动作一定是由 P 发起的,而非 M,因为 P 的数量是固定的,如果一个 M 得不到一个 P,那么这个 M 是没有执行的本地队列的,更谈不上向其他的 P 队列偷取了。
2. 移交(Hand Off)机制
   当本线程因为 G 进行系统调用阻塞时,线程会释放绑定的 P,把 P 转移给其他空闲的线程执行,此时若在 M1 的 GPM 组合中,G1 正在被调度,并且已经发生了阻塞,则这个时候就会触发移交的设计机制。
   GPM 模型为了更大程度地利用 M 和 P 的性能,不会让一个 P 永远被一个阻塞的 G1 耽误之后的工作,所以遇⻅这种情况的时候,移交机制的设计理念是应该立刻将此时的 P 释放出来。
   ![移交机制:G1发现阻塞.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/移交机制：G1发现阻塞.png)
   为了释放 P,所以将 P 和 M1、G1 分离,M1 由于正在执行当前的 G1,全部的程序栈空间均在 M1 中保存,所以 M1 此时应该与 G1 一同进入阻塞的状态,但是已经被释放的 P 需要跟另一个 M 进行绑定,所以就会选择一个 M3(如果此时没有M3,则会创建一个新的或者唤醒一个正在睡眠的M)进行绑定,这样新的 P 就会继续工作,接收新的 G 或者从其他的队列中实施偷取机制。
   ![移交机制:阻塞的P被释放.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/移交机制：阻塞的P被释放.png)

##### 利用并行

GOMAXPROCS 设置 P 的数量,最多有 GOMAXPROCS 个线程分布在多个 CPU 上同时运行。
GOMAXPROCS 也限制了并发的程度,例如 GOMAXPROCS = 核数 / 2,表示最多利用一半的 CPU 核进行并行。

##### 抢占

在 Co-routine 中要等待一个协程主动让出 CPU 才执行下一个协程。
在 Go 中,一个 Goroutine 最多占用CPU 10ms,防止其他 Goroutine 无资源可用,这是 Goroutine 不同于 Co-routine 的一个地方。

##### 全局G队列

在新的调度器中依然有全局 G 队列,但功能已经被弱化了,当 M 执行偷取,但从其他 P 偷不到 G 时,它可以从全局 G 队列获取 G。

![全局队列获取.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/全局队列获取.png)

#### go func() 调度流程

1. 通过 go func() 创建一个 Goroutine
   ![go func()创建Goroutine.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/go-func()创建Goroutine.png)
2. 有两个存储 G 的队列,一个是局部调度器 P 的本地队列,另一个全局 G 队列。
   新创建的 G 会先保存在 P 的本地队列中,如果 P 本地队列满了,则会保存在全局的队列中。
   ![go func()新建G的放置位置.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/go-func()新建G的放置位置.png)
3. G 只能运行在 M 中,一个 M 必须持有一个 P,M 与 P 是 1:1 的关系。
   M 会从 P 的本地队列弹出一个可执行状态的 G 来执行,如果 P 的本地队列为空,则会从全局队列进行获取,如果从全局队列获取不到,则会向其他的 MP 组合偷取一个可执行的 G 来执行。
   ![go func()获取G的方式.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/go-func()获取G的方式.png)
4. ⼀个 M 调度 G 执⾏的过程是⼀个循环机制。
   ![go func()M调度G是循环往复的.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/go-func()M调度G是循环往复的.png)
5. 当 M 执⾏某⼀个 G 时如果发⽣了 syscall 或者其余阻塞操作,则 M 会阻塞,如果当前有⼀些 G 在执⾏,runtime 则会把这个线程 M 从 P 中移除(Detach),然后创建⼀个新的操作系统线程（如果有空闲的线程可⽤就复⽤空闲线程）来服务于这个 P。
   ![go func()当M1上的G发生阻塞.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/go-func()当M1上的G发生阻塞.png)
6. 当 M 系统调⽤结束时,这个 G 会尝试获取⼀个空闲的 P 执⾏,并放⼊这个 P 的本地队列。如果获取不到 P,则这个线程 M 会变成休眠状态,加⼊空闲线程中,然后这个 G 会被放⼊全局队列中。
   ![go func()M1将休眠，G回到全局队列.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/go-func()M1将休眠，G回到全局队列.png)

#### 调度器的生命周期

Go 语⾔调度器的 GPM 模型中还有两个⽐较特殊的⻆⾊，它们分别是 M0 和 G0。

1. M0
    1. 启动程序后的编号为0的主线程。
    2. 在全局命令 runtime.m0 中，不需要在 heap 堆上分配。
    3. 负责执⾏初始化操作和启动第 1 个 G。
    4. 启动第 1 个 G 后，M0 就和其他的 M ⼀样了。
2. G0
    1. 每次启动⼀个 M，创建的第1个 Goroutine 就是 G0。
    2. G0 ⽤于负责调度 G，此外还有信号处理、抢占切换等职责。
    3. G0 不指向任何可执⾏的用户函数，但仍会运行 runtime 函数。
    4. 每个 M 都会有⼀个⾃⼰的 G0。
    5. 在调度或系统调度时，会使⽤ M 切换到 G0，再通过 G0 调度。
    6. M0 的 G0 会放在全局空间。

对于一个简单的 main 程序

~~~go
package main

import "fmt"

func main() {
	fmt.Println("hello world")
}
~~~

流程如下：

1. runtime 创建最初的线程 M0 和 Goroutine G0，并将它们关联。
2. 调度器初始化：初始化 M0、栈、垃圾回收，以及创建和初始化由 GOMAXPROCS 个 P 构成的 P 列表。
3. 示例代码中的 main()函数是 main.main，runtime 中也有 1 个 main() 函数 runtime.main，代码经过编译后，runtime.main 会调⽤ main.main，程序启动时会为 runtime.main 创建 Goroutine，称为 Main Goroutine，然后把 Main Goroutine 加⼊ P 的本地队列。
4. 启动 M0,M0 已经绑定了 P，会从 P 的本地队列获取 G，并获取 Main Goroutine。
5. G 拥有栈，M 根据 G 中的栈信息和调度信息设置运⾏环境。
6. M 运⾏ G。
7. G 退出，再次回到 M 获取可运⾏的 G，这样重复下去，直到 main.main 退出，runtime.main 执⾏ Defer 和 Panic 处理，或调⽤ runtime.exit 退出程序。

调度器的⽣命周期⼏乎占满了⼀个 Go 程序的⼀⽣。
runtime.main 的 Goroutine 执⾏之前都是为调度器做准备⼯作，runtime.main 的 Goroutine 运⾏才是调度器的真正开始，直到 runtime.main 结束⽽结束。

#### 可视化 GPM 编程

Go 语⾔提供了两种⽅式可以查看⼀个程序的 GPM 数据。

##### go tool trace

trace 记录了运⾏时的信息，能提供可视化的 Web ⻚⾯。

以下面的程序为例：

~~~go
package main

import (
	"fmt"
	"os"
	"runtime/trace"
)

func main() {
	f, err := os.Create("trace.out")
	if err != nil {
		panic(err)
	}
	defer f.Close()

	err = trace.Start(f)
	if err != nil {
		panic(err)
	}
	defer trace.Stop()

	// main
	fmt.Println("hello world")
}
~~~

运行后会得到 trace.out 文件，使用 `go tool` 打开该文件：

~~~
ubuntu@ubuntu:~$ go tool trace trace.out
2025/12/27 22:00:48 Preparing trace for viewer...
2025/12/27 22:00:48 Splitting trace for viewer...
2025/12/27 22:00:48 Opening browser. Trace viewer is listening on http://127.0.0.1:64230
~~~

通过浏览器打开后，点开 view 可以看到：

![trace信息.png](../../images/读书笔记/《深入理解Go语言》读书笔记-Go%20语言协程调度器GPM模型/trace信息.png)

##### Debug trace

编译下面的程序：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	for i := 0; i < 5; i++ {
		time.Sleep(1 * time.Second)
		fmt.Println("hello world")
	}
}
~~~

使用 debug 运行：

~~~shell
ubuntu@ubuntu:~$ go build main.go
ubuntu@ubuntu:~$ GODEBUG=schedtrace=1000 main
SCHED 0ms: gomaxprocs=20 idleprocs=20 threads=6 spinningthreads=0 needspinning=0 idlethreads=3 runqueue=0 [ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ] schedticks=[ 1 4 2 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ]
hello world
SCHED 1004ms: gomaxprocs=20 idleprocs=20 threads=6 spinningthreads=0 needspinning=0 idlethreads=3 runqueue=0 [ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ] schedticks=[ 1 4 2 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ]
hello world
SCHED 2005ms: gomaxprocs=20 idleprocs=20 threads=6 spinningthreads=0 needspinning=0 idlethreads=3 runqueue=0 [ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ] schedticks=[ 1 4 2 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ]
hello world
SCHED 3014ms: gomaxprocs=20 idleprocs=20 threads=6 spinningthreads=0 needspinning=0 idlethreads=3 runqueue=0 [ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ] schedticks=[ 1 4 2 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ]
hello world
SCHED 4016ms: gomaxprocs=20 idleprocs=20 threads=6 spinningthreads=0 needspinning=0 idlethreads=3 runqueue=0 [ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ] schedticks=[ 1 4 2 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ]
hello world
~~~

1. SCHED：调试信息输出标志字符串，代表本⾏是Goroutine调度器的输出。
2. 0ms：从程序启动到输出这⾏⽇志的时间。
3. gomaxprocs：P 的数量（并行度的上限），因为默认的 P 的属性是和 CPU 核⼼数量⼀致，当然也可以通过 GOMAXPROCS 设置。
4. idleprocs：处于 idle 状态、没有绑定运行 G 的 P 的数量；通过 gomaxprocs 和 idleprocs 的差值，就可知道执⾏ Go 代码的 P 的数量。
5. threads：os threads/M 的数量，包含 scheduler 使⽤的 m 数量，加上 runtime ⾃⽤的类似 sysmon 这样的 thread 的数量。
6. spinningthreads：处于⾃旋状态的os thread数量。
7. needspinning：当前调度器是否需要新的 spinning M。
8. idlethread：处于 idle 状态的 os thread 的数量。
9. runqueue=0：全局 runqueue（sched.runq）中等待执行的 G 的数量。
10. \[0 0 ...]：每个 P 的本地 runqueue 中等待执行的 G 的数量，数量与 gomaxprocs 一致。
11. schedticks=\[ ... ]：每个 P 上发生过多少次调度循环（schedule 调用）。

### Go 调度器调度流程

参考 Go 版本 1.25.5 的代码。
场景：当一个 M 已经绑定一个 P，准备执行下一个 G。

首先调度器的总体结构：

1. newproc 创建 G
2. ready/runqput G 进入 runnable
3. schedule 调度入口
4. findRunnable 寻找可运行 G
5. execute G 真正运行
6. park/exit/preempt 阻塞、退出、抢占

#### 创建阶段（newproc）

~~~
go f()：编译器会调用 newproc，newproc 流程如下
↓
newproc1：
  - 分配 / 复用 G
  - 初始化栈与 sched 上下文
  - 状态从 _Gdead 原子切换为 _Grunnable（或 _Gwaiting）
↓
runqput：
  - 优先放入 runnext（若 next=true 且条件允许）
  - 否则放入当前 P 的本地 runq
  - 若本地 runq 满：
      调用 runqputslow
      将本地 runq 的前一半（len/2）+ 当前 G
      批量转移到 global runq
↓
当一个 G 被变为 runnable（newproc / ready）时，
在调度器已初始化且条件允许的情况下：
  调用 wakep
↓
wakep：
  - 若已有 spinning M，则直接返回
  - 否则尝试从 idle P 队列中取一个 P
  - 若没有 idle P（所有 P 已在用），则什么都不做
  - 若成功取到 P：
      启动 / 唤醒一个 M
      绑定该 P
      以 spinning 状态开始调度
~~~

go f()：`newproc()`: go1.25.5/src/runtime/proc.go:5158

~~~go
// Create a new g running fn.
// Put it on the queue of g's waiting to run.
// The compiler turns a go statement into a call to this.
func newproc(fn *funcval) {
	gp := getg()
	pc := sys.GetCallerPC()
	systemstack(func() {
		newg := newproc1(fn, gp, pc, false, waitReasonZero)

		pp := getg().m.p.ptr()
		runqput(pp, newg, true)

		if mainStarted {
			wakep()
		}
	})
}
~~~

创建 G ：`newproc1()`: go1.25.5/src/runtime/proc.go:5176

~~~go
// Create a new g in state _Grunnable (or _Gwaiting if parked is true), starting at fn.
// callerpc is the address of the go statement that created this. The caller is responsible
// for adding the new g to the scheduler. If parked is true, waitreason must be non-zero.
func newproc1(fn *funcval, callergp *g, callerpc uintptr, parked bool, waitreason waitReason) *g {
	if fn == nil {
		fatal("go of nil func value")
	}

	mp := acquirem() // disable preemption because we hold M and P in local vars.
	pp := mp.p.ptr()
	newg := gfget(pp)
	if newg == nil {
		newg = malg(stackMin)
		casgstatus(newg, _Gidle, _Gdead)
		allgadd(newg) // publishes with a g->status of Gdead so GC scanner doesn't look at uninitialized stack.
	}
	if newg.stack.hi == 0 {
		throw("newproc1: newg missing stack")
	}

	if readgstatus(newg) != _Gdead {
		throw("newproc1: new g is not Gdead")
	}

	totalSize := uintptr(4*goarch.PtrSize + sys.MinFrameSize) // extra space in case of reads slightly beyond frame
	totalSize = alignUp(totalSize, sys.StackAlign)
	sp := newg.stack.hi - totalSize
	if usesLR {
		// caller's LR
		*(*uintptr)(unsafe.Pointer(sp)) = 0
		prepGoExitFrame(sp)
	}
	if GOARCH == "arm64" {
		// caller's FP
		*(*uintptr)(unsafe.Pointer(sp - goarch.PtrSize)) = 0
	}

	memclrNoHeapPointers(unsafe.Pointer(&newg.sched), unsafe.Sizeof(newg.sched))
	newg.sched.sp = sp
	newg.stktopsp = sp
	newg.sched.pc = abi.FuncPCABI0(goexit) + sys.PCQuantum // +PCQuantum so that previous instruction is in same function
	newg.sched.g = guintptr(unsafe.Pointer(newg))
	gostartcallfn(&newg.sched, fn)
	newg.parentGoid = callergp.goid
	newg.gopc = callerpc
	newg.ancestors = saveAncestors(callergp)
	newg.startpc = fn.fn
	newg.runningCleanups.Store(false)
	if isSystemGoroutine(newg, false) {
		sched.ngsys.Add(1)
	} else {
		// Only user goroutines inherit synctest groups and pprof labels.
		newg.bubble = callergp.bubble
		if mp.curg != nil {
			newg.labels = mp.curg.labels
		}
		if goroutineProfile.active {
			// A concurrent goroutine profile is running. It should include
			// exactly the set of goroutines that were alive when the goroutine
			// profiler first stopped the world. That does not include newg, so
			// mark it as not needing a profile before transitioning it from
			// _Gdead.
			newg.goroutineProfiled.Store(goroutineProfileSatisfied)
		}
	}
	// Track initial transition?
	newg.trackingSeq = uint8(cheaprand())
	if newg.trackingSeq%gTrackingPeriod == 0 {
		newg.tracking = true
	}
	gcController.addScannableStack(pp, int64(newg.stack.hi-newg.stack.lo))

	// Get a goid and switch to runnable. Make all this atomic to the tracer.
	trace := traceAcquire()
	var status uint32 = _Grunnable
	if parked {
		status = _Gwaiting
		newg.waitreason = waitreason
	}
	if pp.goidcache == pp.goidcacheend {
		// Sched.goidgen is the last allocated id,
		// this batch must be [sched.goidgen+1, sched.goidgen+GoidCacheBatch].
		// At startup sched.goidgen=0, so main goroutine receives goid=1.
		pp.goidcache = sched.goidgen.Add(_GoidCacheBatch)
		pp.goidcache -= _GoidCacheBatch - 1
		pp.goidcacheend = pp.goidcache + _GoidCacheBatch
	}
	newg.goid = pp.goidcache
	casgstatus(newg, _Gdead, status)
	pp.goidcache++
	newg.trace.reset()
	if trace.ok() {
		trace.GoCreate(newg, newg.startpc, parked)
		traceRelease(trace)
	}

	// Set up race context.
	if raceenabled {
		newg.racectx = racegostart(callerpc)
		newg.raceignore = 0
		if newg.labels != nil {
			// See note in proflabel.go on labelSync's role in synchronizing
			// with the reads in the signal handler.
			racereleasemergeg(newg, unsafe.Pointer(&labelSync))
		}
	}
	releasem(mp)

	return newg
}
~~~

将 G 放入队列：`runqput()`: go1.25.5/src/runtime/proc.go:7058

~~~go
// runqput tries to put g on the local runnable queue.
// If next is false, runqput adds g to the tail of the runnable queue.
// If next is true, runqput puts g in the pp.runnext slot.
// If the run queue is full, runnext puts g on the global queue.
// Executed only by the owner P.
func runqput(pp *p, gp *g, next bool) {
	if !haveSysmon && next {
		// A runnext goroutine shares the same time slice as the
		// current goroutine (inheritTime from runqget). To prevent a
		// ping-pong pair of goroutines from starving all others, we
		// depend on sysmon to preempt "long-running goroutines". That
		// is, any set of goroutines sharing the same time slice.
		//
		// If there is no sysmon, we must avoid runnext entirely or
		// risk starvation.
		next = false
	}
	if randomizeScheduler && next && randn(2) == 0 {
		next = false
	}

	if next {
	retryNext:
		oldnext := pp.runnext
		if !pp.runnext.cas(oldnext, guintptr(unsafe.Pointer(gp))) {
			goto retryNext
		}
		if oldnext == 0 {
			return
		}
		// Kick the old runnext out to the regular run queue.
		gp = oldnext.ptr()
	}

retry:
	h := atomic.LoadAcq(&pp.runqhead) // load-acquire, synchronize with consumers
	t := pp.runqtail
	if t-h < uint32(len(pp.runq)) {
		pp.runq[t%uint32(len(pp.runq))].set(gp)
		atomic.StoreRel(&pp.runqtail, t+1) // store-release, makes the item available for consumption
		return
	}
	if runqputslow(pp, gp, h, t) {
		return
	}
	// the queue is not full, now the put above must succeed
	goto retry
}

// Put g and a batch of work from local runnable queue on global queue.
// Executed only by the owner P.
func runqputslow(pp *p, gp *g, h, t uint32) bool {
	var batch [len(pp.runq)/2 + 1]*g

	// First, grab a batch from local queue.
	n := t - h
	n = n / 2
	if n != uint32(len(pp.runq)/2) {
		throw("runqputslow: queue is not full")
	}
	for i := uint32(0); i < n; i++ {
		batch[i] = pp.runq[(h+i)%uint32(len(pp.runq))].ptr()
	}
	if !atomic.CasRel(&pp.runqhead, h, h+n) { // cas-release, commits consume
		return false
	}
	batch[n] = gp

	if randomizeScheduler {
		for i := uint32(1); i <= n; i++ {
			j := cheaprandn(i + 1)
			batch[i], batch[j] = batch[j], batch[i]
		}
	}

	// Link the goroutines.
	for i := uint32(0); i < n; i++ {
		batch[i].schedlink.set(batch[i+1])
	}

	q := gQueue{batch[0].guintptr(), batch[n].guintptr(), int32(n + 1)}

	// Now put the batch on global queue.
	lock(&sched.lock)
	globrunqputbatch(&q)
	unlock(&sched.lock)
	return true
}
~~~

尝试添加 P 来执行 G：`wakep`: go1.25.5/src/runtime/proc.go:3217

~~~go
// Tries to add one more P to execute G's.
// Called when a G is made runnable (newproc, ready).
// Must be called with a P.
//
// wakep should be an internal detail,
// but widely used packages access it using linkname.
// Notable members of the hall of shame include:
//   - gvisor.dev/gvisor
//
// Do not remove or change the type signature.
// See go.dev/issue/67401.
//
//go:linkname wakep
func wakep() {
	// Be conservative about spinning threads, only start one if none exist
	// already.
	if sched.nmspinning.Load() != 0 || !sched.nmspinning.CompareAndSwap(0, 1) {
		return
	}

	// Disable preemption until ownership of pp transfers to the next M in
	// startm. Otherwise preemption here would leave pp stuck waiting to
	// enter _Pgcstop.
	//
	// See preemption comment on acquirem in startm for more details.
	mp := acquirem()

	var pp *p
	lock(&sched.lock)
	pp, _ = pidlegetSpinning(0)
	if pp == nil {
		if sched.nmspinning.Add(-1) < 0 {
			throw("wakep: negative nmspinning")
		}
		unlock(&sched.lock)
		releasem(mp)
		return
	}
	// Since we always have a P, the race in the "No M is available"
	// comment in startm doesn't apply during the small window between the
	// unlock here and lock in startm. A checkdead in between will always
	// see at least one running M (ours).
	unlock(&sched.lock)

	startm(pp, true, false)

	releasem(mp)
}
~~~
