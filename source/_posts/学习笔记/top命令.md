---
layout: post
title: top命令
date: 2025-09-03 10:01:14
tags:
  - linux
categories:
  - 学习笔记
---

## top 命令

top 命令是 Linux 常用的实时系统监控工具。它默认每隔 3 秒刷新一次。

### 启动参数（命令行选项）

| 参数           | 全称                       | 作用                                           |
|--------------|--------------------------|----------------------------------------------|
| `-d seconds` | **delay-time**           | 刷新间隔（默认 3 秒），例如 `top -d 1` 每 1 秒刷新一次         |
| `-n count`   | **number-of-iterations** | 运行多少次后退出，例如 `top -n 5` 显示 5 次后退出             |
| `-p pid`     | **process-id**           | 仅监控指定进程，例如 `top -p 1234`                     |
| `-u user`    | **user-name**            | 仅显示指定用户的进程，例如 `top -u root`                  |
| `-U user`    | **UID-based**            | 类似 `-u`，但基于 UID                              |
| `-b`         | **batch-mode**           | 批处理模式（无交互，常用于重定向到文件：`top -b -n 1 > out.txt`） |
| `-H`         | **threads-mode**         | 显示线程而非进程                                     |
| `-i`         | **idle-process toggle**  | 启动时忽略空闲任务（= 运行时按 `i`）                        |
| `-c`         | **command-line toggle**  | 显示完整命令行（= 运行时按 `c`）                          |

### 交互式快捷键（运行时输入）

#### 显示控制

| 按键  | 全称                      | 作用                 |
|-----|-------------------------|--------------------|
| `h` | **help**                | 显示帮助（所有快捷键说明）      |
| `q` | **quit**                | 退出 `top`           |
| `z` | **color/mono toggle**   | 切换彩色/单色模式          |
| `B` | **bold toggle**         | 是否加粗高亮             |
| `l` | **load-average toggle** | 显示/隐藏顶部的负载信息       |
| `t` | **tasks toggle**        | 显示/隐藏任务和 CPU 使用情况  |
| `m` | **memory toggle**       | 显示/隐藏内存/Swap 行     |
| `1` | **cpu-per-core**        | 展开/收起所有 CPU 核心的使用率 |

---

#### 排序与过滤

| 按键      | 全称                    | 作用                       |
|---------|-----------------------|--------------------------|
| `P`     | **sort by CPU**       | 按 CPU 使用率排序（默认）          |
| `M`     | **sort by Memory**    | 按内存使用率排序                 |
| `T`     | **sort by Time**      | 按运行时间排序                  |
| `N`     | **sort by PID**       | 按 PID 排序                 |
| `R`     | **reverse sort**      | 反向排序                     |
| `O`（大写） | **change sort field** | 按其他字段排序（进入交互菜单选择）        |
| `o`（小写） | **filter by field**   | 过滤显示（例如 `COMMAND=nginx`） |
| `u`     | **filter by user**    | 只显示某个用户的进程               |

---

#### 进程控制

| 按键  | 全称               | 作用                               |
|-----|------------------|----------------------------------|
| `k` | **kill**         | 杀死进程（输入 PID 和信号，默认 15 `SIGTERM`） |
| `r` | **renice**       | 调整进程 Nice 值（输入 PID 和新 nice 值）    |
| `s` | **set-delay**    | 修改刷新间隔（秒）                        |
| `W` | **write config** | 保存当前配置，下次启动生效（写入 `~/.toprc`）     |

---

#### 进程显示切换

| 按键  | 全称                          | 作用                  |
|-----|-----------------------------|---------------------|
| `c` | **command-line toggle**     | 显示完整命令行 vs 仅命令名     |
| `i` | **idle toggle**             | 显示/隐藏空闲进程           |
| `H` | **threads toggle**          | 显示线程而不是进程           |
| `x` | **highlight sort column**   | 高亮当前排序列             |
| `y` | **highlight running tasks** | 高亮正在运行的任务           |
| `u` | **user filter**             | 只显示指定用户的进程          |
| `V` | **forest view**             | 树状显示进程（类似 `pstree`） |

## 显示信息

~~~
top - 13:24:16 up 3 days, 22:41,  0 user,  load average: 0.14, 0.14, 0.11
Tasks: 163 total,   1 running, 162 sleeping,   0 stopped,   0 zombie
%Cpu(s):  1.3 us,  0.8 sy,  0.0 ni, 97.1 id,  0.7 wa,  0.0 hi,  0.1 si,  0.0 st 
MiB Mem :   7940.7 total,    222.3 free,   6399.8 used,   1590.8 buff/cache     
MiB Swap:      0.0 total,      0.0 free,      0.0 used.   1540.9 avail Mem 

  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND                                                                                    
 1197 root      20   0 1963420 640468  36736 S   4.0   7.9 282:35.87 kube-apiserver                                                                             
 2327 root      20   0 2237824  49708  24064 S   1.3   0.6  80:30.91 calico-node                                                                                
  771 root       0 -20   11.3g  89348  23552 S   1.0   1.1  79:04.21 etcd                                                                                       
 1228 root      20   0 1412044  84508  21376 S   1.0   1.0  78:41.97 kube-controller                                                                            
32616 root      20   0 2227064  92080  50560 S   1.0   1.1  79:00.74 kubelet                                                                                    
 1212 root      20   0 1283348  32972  13056 S   0.3   0.4  15:25.14 kube-scheduler                                                                             
 1648 root      20   0  746604  16832   6400 S   0.3   0.2   9:40.87 node-cache                                                                                 
15415 root      20   0       0      0      0 I   0.3   0.0   0:00.28 kworker/1:1-events                                                                         
31742 root      20   0 2398412  60844  29696 S   0.3   0.7  26:17.82 containerd                                                                                 
43556 ubuntu    20   0   13228   6528   4352 R   0.3   0.1   0:00.18 top                                                                                        
    1 root      20   0   23084  12288   7680 S   0.0   0.2   1:12.93 systemd                                                                                    
    2 root      20   0       0      0      0 S   0.0   0.0   0:00.05 kthreadd                                                                                   
    3 root      20   0       0      0      0 S   0.0   0.0   0:00.00 pool_workqueue_release                                                                     
    4 root       0 -20       0      0      0 I   0.0   0.0   0:00.00 kworker/R-rcu_g                                                                            
    5 root       0 -20       0      0      0 I   0.0   0.0   0:00.00 kworker/R-rcu_p                                                                            
    6 root       0 -20       0      0      0 I   0.0   0.0   0:00.00 kworker/R-slub_                                                                            
    7 root       0 -20       0      0      0 I   0.0   0.0   0:00.00 kworker/R-netns                                                                            
    9 root       0 -20       0      0      0 I   0.0   0.0   0:00.00 kworker/0:0H-events_highpri                                                                
   12 root       0 -20       0      0      0 I   0.0   0.0   0:00.00 kworker/R-mm_pe                                                                            
   13 root      20   0       0      0      0 I   0.0   0.0   0:00.00 rcu_tasks_kthread                                                                          
   14 root      20   0       0      0      0 I   0.0   0.0   0:00.00 rcu_tasks_rude_kthread                                                                     
   15 root      20   0       0      0      0 I   0.0   0.0   0:00.00 rcu_tasks_trace_kthread                                                                    
   16 root      20   0       0      0      0 S   0.0   0.0   0:13.07 ksoftirqd/0                                                                                
   17 root      20   0       0      0      0 I   0.0   0.0   1:02.67 rcu_preempt                                                                                
   18 root      rt   0       0      0      0 S   0.0   0.0   0:02.89 migration/0                                                                                
   19 root     -51   0       0      0      0 S   0.0   0.0   0:00.00 idle_inject/0                                                                              
   20 root      20   0       0      0      0 S   0.0   0.0   0:00.00 cpuhp/0                                                                                    
   21 root      20   0       0      0      0 S   0.0   0.0   0:00.00 cpuhp/2                                                                                    
   22 root     -51   0       0      0      0 S   0.0   0.0   0:00.00 idle_inject/2                                                                              
   23 root      rt   0       0      0      0 S   0.0   0.0   0:02.40 migration/2     
~~~

### 顶部状态

~~~
top - 13:24:16 up 3 days, 22:41,  0 user,  load average: 0.14, 0.14, 0.11
~~~

* **13:24:16** → 当前系统时间
* **up 3 days, 22:41** → 系统已运行 3 天 22 小时 41 分钟
* **0 user** → 当前登录用户数（这里没有用户直接登录）
* **load average: 0.14, 0.14, 0.11** 系统 1 分钟、5 分钟、15 分钟的平均负载。数字越接近 CPU 核心数，说明负载越合理。比如 4 核 CPU，load average 小于 4 基本健康。

~~~
Tasks: 163 total,   1 running, 162 sleeping,   0 stopped,   0 zombie
~~~

* **163 total** → 系统中共有 163 个进程
* **1 running** → 正在运行的进程 1 个
* **162 sleeping** → 休眠状态的进程 162 个（大部分进程常处于此状态，等待事件触发）
* **0 stopped** → 停止的进程（通过信号暂停）
* **0 zombie** → 僵尸进程（子进程结束但父进程未回收资源，数量多时是问题信号）

~~~
%Cpu(s):  1.3 us,  0.8 sy,  0.0 ni, 97.1 id,  0.7 wa,  0.0 hi,  0.1 si,  0.0 st
~~~

* **1.3 us (user space)** → 用户态进程占用 CPU 1.3%
* **0.8 sy (system)** → 内核态占用 CPU 0.8%
* **0.0 ni (nice)** → 调整过 nice 优先级的进程占用 0%
* **97.1 id (idle)** → CPU 空闲 97.1%
* **0.7 wa (I/O wait)** → 等待 I/O 的 CPU 时间（磁盘/网络）
* **0.0 hi (hardware interrupt)** → 硬件中断占用 CPU 时间百分比
* **0.1 si (software interrupt)** → 软件中断占用 CPU 时间百分比
* **0.0 st (steal time)** → 被虚拟机管理程序（Hypervisor）“偷走”的 CPU 时间百分比（虚拟化场景有意义）

> 一般关注 us+sy（实际负载），如果 wa 很高，说明 I/O 瓶颈。

~~~
MiB Mem :   7940.7 total,    222.3 free,   6399.8 used,   1590.8 buff/cache
~~~

* **7940.7 total** → 总内存 7.9 GB
* **222.3 free** → 空闲内存 222 MB（未使用部分，Linux 下通常较小）
* **6399.8 used** → 被程序使用的内存 6.4 GB（包含应用+缓存）
* **1590.8 buff/cache** → 缓冲和缓存内存（用于磁盘缓存和文件缓存，可回收）

~~~
MiB Swap:      0.0 total,      0.0 free,      0.0 used.   1540.9 avail Mem
~~~

* **total 0.0** → 没有配置 swap 分区
* **free 0.0** → 空闲 Swap
* **used 0.0** → 已用 Swap
* **avail Mem 1540.9** → 实际可用内存 1.5 GB（考虑缓存和可回收内存），比 free 更准确

> 如果 Swap used 很高，说明物理内存不足。

### 进程列表

~~~
  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND 
~~~

* **PID (Process ID)** → 进程 ID（唯一标识）
* **USER** → 进程所有者（用户名）
* **PR (Priority)** → （内核调度的优先级，数值越小优先级越高）
* **NI (Nice)** → nice 值（用户可调节，-20 \~ 19，影响优先级）
* **VIRT (Virtual Memory)** → 进程使用的虚拟内存 (KB)，进程申请的总地址空间，包括共享库、映射文件等
* **RES (Resident Memory)** → 进程常驻物理内存 (KB)，实际占用的物理内存
* **SHR (Shared Memory)** → 共享内存 (KB)，与其他进程共享的内存
* **S (State)** → 进程状态
	* `R` → running
	* `S` → sleeping
	* `I` → idle
	* `D` → 不可中断睡眠
	* `Z` → 僵尸
* **%CPU (CPU usage)** → CPU 使用率（按刷新周期计算）
* **%MEM (Memory usage)** → 内存使用率（占总内存百分比）
* **TIME+ (CPU Time)** → 进程累计使用的 CPU 时间，格式 *分钟:秒.百分秒*
* **COMMAND** → 进程的命令或程序名（默认显示简写，可按 `c` 显示完整命令行）

## 一些指标的概念

### Nice 值 (Niceness Value)

调节进程的**优先级 (Priority, PR)**，影响 CPU 调度的先后顺序。

* **取值范围**：`-20 ~ 19`
	* **-20** → 最高优先级（最“自私”，会多抢占 CPU）
	* **0** → 默认值
	* **19** → 最低优先级（最“友好”，让出 CPU 机会）
* **关系**：
	* 最终调度优先级由 **PR = base\_priority + NI** 决定
	* `top` 里 **PR** 越小，进程调度优先级越高
* **修改方式**：
	* 启动时指定：`nice -n 10 my_program`
	* 运行时调整：`renice -n -5 -p 1234` （调整 PID=1234 的进程）

* 大型数据分析进程可以 `nice=10` → 不阻塞关键服务
* 系统关键进程可能会设置低 nice 值（-5 \~ -20），保证调度优先级

---

### 交换空间 (Swap Space)

当物理内存不足时，Linux 会把部分**不常用的内存页**写到磁盘上的 Swap 区域，以释放 RAM。
可以让系统避免“内存不足直接崩溃”。但磁盘速度远低于内存，频繁使用 Swap 会导致性能下降（俗称“抖动 / thrashing”）。

* 在 `top` 的 **Swap used** 升高时，说明内存吃紧
* 进程会明显变慢

**Kubernetes 中默认不允许使用交换内存**

Kubernetes 的调度和资源控制主要依赖于 **cgroup 的 CPU、内存限制**。

* **内存限制**：Pod 被限制多少内存，超过就会触发 **OOMKill**。
* 如果允许 swap，那么：
	* Pod 占用的物理内存可能被换出到 swap，而 kubelet 和 cgroup 并不知道。
	* 容器可能“假装”没超内存，实际上性能已经变得非常差。
	* 这会导致 **资源隔离失真**，调度器也无法准确分配资源。

因此，Kubernetes 默认要求节点运行在 **no swap** 的状态下，以保证资源控制的可预测性。

但 Kubernetes 在后续版本有支持开启交换内存的功能：

[New in Kubernetes v1.22: alpha support for using swap memory](https://kubernetes.io/blog/2021/08/09/run-nodes-with-swap-alpha/)
[Kubernetes 1.28: Beta support for using swap on Linux](https://kubernetes.io/zh-cn/blog/2023/08/24/swap-linux-beta/)

### 虚拟内存 (Virtual Memory, VIRT)

每个进程拥有**独立的地址空间**（虚拟内存），由操作系统内核管理并映射到实际物理内存或磁盘。

包含内容：

1. 程序代码
2. 已分配但未实际使用的内存
3. 动态库
4. 内存映射文件（mmap）
5. 可能被换出到 Swap 的部分

指标含义：

* `top` 里的 **VIRT** → 进程可寻址的虚拟内存总量（不等于真实占用 RAM）
* `RES` → 真实常驻物理内存
* `SHR` → 共享内存

举例：一个 Python 程序加载 TensorFlow，`VIRT` 可能几十 GB，但 `RES` 可能只有几百 MB，因为很多库只是映射，并没有真正加载到内存。

### 中断 (Interrupt)

中断是 CPU 在运行用户代码时，被“打断”去处理某个事件的机制。分为**硬件中断**和**软件中断**。

#### 硬件中断 (Hardware Interrupt, hi)

来源：外部硬件设备向 CPU 发出信号
例子：

* 键盘输入（按下一个键）
* 网络接口卡收到数据包
* 磁盘 I/O 完成通知

类比：你正在写字（运行程序），突然电话响了（键盘输入），你必须停下去接电话（处理硬件中断）。

#### 软件中断 (Software Interrupt, si)

来源：内核为处理高频硬件事件，把一些工作转交给“软中断”机制（通常由内核线程完成）。
例子：

* 网络包的协议栈处理（TCP/IP 解析）
* 大量磁盘 IO 的后续处理

类比：电话太多了，你雇了秘书（内核线程）来代接一部分，这就是软件中断。


