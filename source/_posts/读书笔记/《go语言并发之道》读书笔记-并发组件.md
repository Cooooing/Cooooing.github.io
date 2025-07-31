---
layout: post
title: 《go语言并发之道》读书笔记-并发组件
date: 2025-01-14 10:35:39
categories:
  - 读书笔记
tags:
  - 《go语言并发之道》
  - go
  - 并发
---

## 第三章 - Go语言并发组件

这章介绍Go中的特性，以及它如何支持并发。（终于到实际使用了

### goroutine

goroutine是Go语言程序中最基本的组织单位之一。
每个Go语言程序都至少有一个goroutine:main goroutine，它在进程开始时自动创建并启动。
几乎在所有的项目中，你迟早会使用goroutine来解决Go语言编程遇到的问题。所以，它们是什么？

简单地说，goroutine是一个并发的函数（记住：不一定是并行的），与其他代码一起运行。
你可以简单地在一个函数之前添加go关键字来触发：`go sum()`
同样可以作为匿名函数使用！这里有一个例子和前面的例子一样。
然而，我们不是创建一个基于函数的goroutine,而是创建一个基于匿名函数 goroutine:`go func() { // ... }()`

下面的内容来看看 goroutine 是如何工作的？它们是OS线程吗？绿色线程？我们能创造多少个 goroutine？

Go语言中的goroutine是独一无二的（尽管其他的一些语言有类似的并发原语)。
它们不是OS线程，也不是绿色线程（由语言运行时管理的线程），它们是一个更高级别的抽象，称为协程。
**协程是一种非抢占式的简单并发子goroutine(函数、闭包或方法)，也就是说，它们不能被中断。** 取而代之的是，协程有多个点，允许暂停或重新进入。

goroutine的独特之处在于它们与Go语言的运行时的深度集成。goroutine没有定义自己的暂停方法或再运行点。
**Go语言的运行时会观察goroutine的运行时行为，并在它们阻塞时自动挂起它们，然后在它们不被阻塞时恢复它们。**
**在某种程度上，这使它们成为可抢占的，但只是在goroutine被阻塞的情况。** 在运行时和goroutine的逻辑之间，是一种优雅的伙伴关系。
因此，goroutine可以被认为是一种特殊类型的协程。

协程和goroutine都是隐式并发结构，但并发并不是协程的属性：必须同时托管多个协程，并给每个协程一个执行的机会。否则，它们就不会并发！
请注意，这并不意味着协程是隐式并行的。当然有可能有几个协程按顺序并行执行的假象，事实上，这种情况一直在发生。

Go语言的主机托管机制是一个名为M:N调度器的实现，这意味着它将M个绿色线程映射到N个OS线程。然后将goroutine安排在绿色线程上。
当我们的goroutine数量超过可用的绿色线程时，调度程序将处理分布在可用线程上的goroutine,并确保当这些goroutine被阻塞时，其他的goroutine可以运行。
这里只介绍Go语言的并发模型，细节在后续章节中。

Go语言遵循一个称为ork-join的并发模型。
fork这个词指的是在程序中的任意一点，它可以将执行的子分支与共父节点同时运行。
jon这个词指的是，在将来某个时候，这些并发的执行分支将会合并在一起。
![img.png](https://cooooing.github.io/images/读书笔记/《go语言并发之道》读书笔记-并发组件/fork-join示意图.png)

Go语言是如何执行fork的，执行的子线程是goroutine。
让我们回到简单的goroutine例子：

~~~go
package main

import "fmt"

func main() {
	sayHello := func() {
		fmt.Println("hello")
	}
	go sayHello()
	//继续执行自己的逻辑
}
~~~

在这里，sayHello函数将在goroutine上运行，而程序的其余部分将继续执行。
在本例中，没有join点。执行sayHello的goroutine将在未来的某个不确定的时间退出，而程序的其余部分将会继续执行。

但是，这个例子有一个问题：正如上面所写的程序，它不确定sayHello函数是否会运行。
goroutine将会被创建，并计划在Go语言运行时执行，但是它实际上可能没有机会在main goroutine退出之前运行。

实际上，因为我们省略了min函数的其余部分，为了简单起见，当运行这个小示例时，几乎可以肯定的是，程序将在goroutine被系统调用之前完成执行。
因此，你不会看到“hello'”这个词被打印到stdout。你可以在创建goroutine之后执行time.Sleep,但是要记住，这实际上并没有创建一个join点，只有一个竞争条件。
如果回顾第1章，你增加了goroutine在程序退出前执行的概率，但你并不能保证一定会执行。**join点是保证程序正确性和消除竞争条件的关键。**

为了创建一个join点，你必须同步main goroutine和sayHello goroutine。
这可以通过多种方式实现，这里使用：sync.Waitgroup。
下面是一个正确的例子：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var wg sync.WaitGroup
	sayHello := func() {
		defer wg.Done()
		fmt.Println("hello")
	}
	wg.Add(1)
	go sayHello()
	wg.Wait() // 这就是连接点的使用方式
}
~~~

输出如下： `hello`

这个例子将决定main goroutine,直到goroutine托管sayHello函数为止。
我们在示例中使用了许多匿名函数来创建快速goroutine样例。让我们把注意力转移到闭包上。
闭包可以从创建它们的作用域中获取变量。如果你在goroutine中运行一个闭包，那么闭包是在这些变量的副本上运行，还是原值的引用上运行？
让我们试试看：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var wg sync.WaitGroup
	salutation := "hello"
	wg.Add(1)
	go func() {
		defer wg.Done()
		salutation = "welcome" // 尝试修改 salutation 变量
	}()
	wg.Wait()
	fmt.Println(salutation)
}
~~~

运行结果：`welcome`
事实证明，goroutine在它们所创建的相同地址空间内执行，因此我们的程序打印出“welcome”这个词。
让我们再看一个例子。你认为这个程序会输出什么？

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var wg sync.WaitGroup
	for _, salutation := range []string{"hello", "greetings", "good day"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fmt.Println(salutation) // 引用了字符串类型的切片作为创建循环变量的salutation值
		}()
		wg.Wait()
	}
}
~~~

答案比大多数人想象的要复杂得多，而且是为数不多的令人惊讶的事情之一。
大多数人直觉上认为这将会不确定顺序地打印出“hello”“greetings”和“good day”,但看看它做了什么：

~~~
good day
good day
good day
~~~

这里真的是这样吗？在我电脑上的输出是符合大多数人的直觉的：会以不确定的顺序打印出“hello”“greetings”和“good day”。
为什么呢？查了资料后发现，这是循环迭代器变量引用的问题：[常见错误](https://go.dev/wiki/CommonMistakes) [For 语句](https://go.dev/ref/spec#For_statements)
在1.22及后不会出现循环迭代器变量引用的问题。每个循环迭代器变量都是一个新的副本，所以上面程序的输出会是：

~~~
hello
greetings
good day
~~~

并且是乱序的（每次输出都不一致），下面的讨论在1.22之前，1.22及后不会出现。
在上面的示例中，goroutine正在运行一个闭包，**该闭包使用变量salutation时，字符串的迭代已经结束。**
当我们循环迭代时，salutation被分配到slice literal中的下一个字符串值。因为计划中的goroutine可能在未来的任何时间点运行，它不确定在goroutine中会打印出什么值。
在性能比较好的机器上，在goroutine开始之前循环有很高的概率会退出。这意味着变量的salutation值不在范围之内。然后会发生什么呢？
goroutine还能引用一些已经超出范围的东西吗？goroutine不会访问那些可能被垃圾回收的内存吗？
这是一个关于如何管理内存的有趣的点。Go语言运行时会足够小心地将对变量salutation值的引用仍然保留，由内存转移到堆，以便goroutine可以继续访问它。

通常在我的计算机上，在任何goroutine开始运行之前，循环就会退出，所以salutation会被转移到堆中，在我的字符串切片中引用最后一个值“good day”。
所以我通常会看到三次“good day”。编写这个循环的正确方法是将salutation的副本传递到闭包中，这样当goroutine运行时，它将从循环的迭代中操作数据：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var wg sync.WaitGroup
	for _, salutations := range []string{"hello", "greetings", "good day"} {
		wg.Add(1)
		go func(salutations string) {
			defer wg.Done()
			fmt.Println(salutations)
		}(salutations)
	}
	wg.Wait()
}
~~~

当然，在1.22及以后的版本是不需要这么写的。

这些goroutine在相同的地址空间中运行，并且只有简单的宿主函数，所有使用goroutine编写非并发代码是非常自然的。
Go语言的编译器很好地处理了内存中的变量，这样goroutine就不会意外地访问被释放的内存，这使得开发人员可以专注于他们的问题空间而不是内存管理。
然而，这不是一张空白支票。

由于多个goroutine可以在同一个地址空间上运行，所以我们仍然需要担心同步问题。
正如我们已经讨论过的，我们可以选择同步访问goroutine访问的共享内存，或者可以使用CSP原语通过通信来共享内存。

goroutine的另一个好处是它们非常轻。下面是“Go语言FAQ”的摘录：
> 一个新创建的goroutine被赋予了几千字节，这在大部分情况都是足够的。
> 当它不运行时，Go语言运行时就会自动增长（缩小）存储堆栈的内存，允许许多goroutine存在适当的内存中。
> 每个函数调用CPU的开销平均为3个廉价指令。在同一个地址空间中创建成千上万的goroutine是可行的。如果goroutine只是线程，系统的资源消耗会更小。

每个goroutine几千字节，这并没有什么问题！让我们来验证一下。
但是在我们开始之前，我们必须讨论一个关于goroutine有趣的事情：
**GC并没有回收被丢弃的goroutine。**
如果我写如下代码：

~~~go
package main

func main() {
	go func() {
		//将永远阻塞的操作
	}()
	//开始工作
}
~~~

这里的goroutine将一直存在直到进程退出（**协程泄露！**）。在下一个例子中，我们将利用这一点来实际测算goroutine的大小。

在下面的例子中，我们将goroutine不被GC的事实与运行时的自省能力结合起来，并测算在goroutine创建之前和之后分配的内存数量：

~~~go
package main

import (
	"fmt"
	"runtime"
	"sync"
)

func main() {
	memConsumed := func() uint64 {
		runtime.GC()
		var s runtime.MemStats
		runtime.ReadMemStats(&s)
		return s.Sys
	}

	var c <-chan any
	var wg sync.WaitGroup
	noop := func() { wg.Done(); <-c }

	const numGoroutines = 1e6
	wg.Add(numGoroutines)
	before := memConsumed()
	for i := numGoroutines; i > 0; i-- {
		go noop()
	}
	wg.Wait()
	after := memConsumed()
	fmt.Printf("%fkb", float64(after-before)/numGoroutines/1024)
}
~~~

我们需要一个永远不会退出的goroutine.,这样就可以在内存中保留一段时间用于测侧算。
定义了要创建的goroutine的数量。我们将用大数定律，渐渐地接近一个goroutine的大小。
输出结果为：`8.560508kb`，这里go版本为1.22.4。老版本goroutine的大小会更小。

理论上百万个goroutine内存占用只有9G。这也足以说明goroutine的轻量。
**可能会影响性能的是上下文切换，即当一个被托管的并发进程必须保存它的状态以切换到一个不同的运行并发进程时。**
如果我们有太多的并发进程，可能会将所有的CPU时间消耗在它们之间的上下文切换上，而没有资源完成任何真正需要CPU的工作。
在操作系统级别，使用线程可能非常昂贵。OS线程必须保存如寄存器值、查找表和内存映射之类的东西，以便能够在有限的时间内成功地切换回当前线程。
然后，它必须为传入的线程加载相同的信息。

软件中的上下文切换相对来说要廉价得多。
在一个软件定义的调度器下，运行时可以更有选择性地保存数据用于检索，如何持久化，以及何时需要持久化。
让我们来看看在OS线程和goroutine之间切换的上下文的相对性能。
首先，我们将利用Linux的内置基准测试套件来度量在相同核心的两个线程之间发送消息需要多长时间（需要安装perf工具，需要与内核版本匹配：`sudo apt install linux-tools-common linux-tools-generic`）：
`taskset -c 0 perf bench sched pipe -T`

输出如下：

~~~
# Running 'sched/pipe' benchmark:
# Executed 1000000 pipe operations between two threads

     Total time: 5.855 [sec]

       5.855618 usecs/op
         170776 ops/sec
~~~

这个基准实际上度量了在线程上发送和接收消息所需的时间，因此我们将计算结果并将其除以2。
我们用了`2.927μs`来进行上下文切换。这看起来不算太糟，但还是保留判断，直到我们检查goroutine之间的上下文切换。

我们将使用Go语言构建一个类似的基准。下面的示例将创建两个goroutine并在它们之间发送一条消息：

~~~go
package main

import (
	"sync"
	"testing"
)

func BenchmarkContextSwitch(b *testing.B) {
	var wg sync.WaitGroup
	begin := make(chan struct{})
	c := make(chan struct{})
	var token struct{}
	sender := func() {
		defer wg.Done()
		<-begin
		for i := 0; i < b.N; i++ {
			c <- token
		}
	}
	receiver := func() {
		defer wg.Done()
		<-begin
		for i := 0; i < b.N; i++ {
			<-c
		}
	}
	wg.Add(2)
	go sender()
	go receiver()
	b.StartTimer()
	close(begin)
	wg.Wait()
}
~~~

运行结果（`go test -bench=. -cpu=1`）：

~~~
BenchmarkContextSwitch   6329348        218.8 ns/op
PASS
ok   learn 1.582s
~~~

每个上下文切换需要`218.8ns`，2.927μs的7.48%
很难断言goroutine会导致上下文切换过于频繁，但上限可能不会成为使用goroutine的阻碍。

### sync包

**sync包包含对低级别内存访问同步最有用的并发原语**。
如果你使用的语言主要通过内存访问同步来处理并发，那么你可能已经熟悉了这些类型。
Go语言和这些语言之间的区别在于，Go语言已经在内存访问同步原语之上构建了一组新的并发原语，以向你提供一组扩展的工作。
正如我们在第2章“Go语言的并发哲学”中所讨论的，这些操作都有它们的用途，主要是在诸如struct这样的小范围内。由你决定何时进行内存访问同步。
说到这里，让我们开始看一下sync包公开的各种原语。

#### WaitGroup

当你不关心并发操作的结果，或者你有其他方法来收集它们的结果时，WaitGroup是等待一组并发操作完成的好方法。
如果这两个条件都不满足，我建议你使用channel和select语句。
下面是一个使用WaitGroup等待goroutine完成的基本例子：

~~~go
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		fmt.Println("1st goroutine sleeping...")
		time.Sleep(1)
	}()
	wg.Add(1)
	go func() {
		defer wg.Done()
		fmt.Println("2nd goroutine sleeping...")
		time.Sleep(2)
	}()
	wg.Wait()
	fmt.Println("All goroutines completed.")
}
~~~

输出如下：

~~~
2nd goroutine sleeping...
1st goroutine sleeping...
All goroutines completed.
~~~

可以将WaitGroup视为一个并发-安全的计数器：**调用通过传入的整数执行add方法增加计数器的增量，并调用Done方法对计数器进行递减。Wait阻塞，直到计数器为零。**

注意，添加的Add调用是在他们帮助跟踪的goroutine之外完成的。
如果我们不这样做，我们就会引人一种竞争条件，因为在本章前面“goroutines'”中，我们不能保证goroutine何时会被调度，可以在goroutine开始调度前调用Wait方法。
如果将调用Add的方法添加到goroutine的闭包中，那么Wait调用可能会直接返回，而且不会阻塞，因为Add调用不会发生。

##### 互斥锁与读写锁

Mutex 是“互斥”的意思，是保护程序中临界区的一种方式。
临界区是你程序中需要独占访问共享资源的区域。
Mutex提供了一种安全的方式来表示对这些共享资源的独占访问。
为了使用一个资源，channel通过通信共享内存，而Mutex通过开发人员的约定同步访问共享内存。
你可以通过使用Mutex对内存进行保护来协调对内存的访问。
这里有一个简单的例子，两个goroutine试图增加和减少一个共同的值，它们使用Mutex互斥锁来同步访问：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var count int
	var lock sync.Mutex
	increment := func() {
		lock.Lock()
		defer lock.Unlock()
		count++
		fmt.Printf("Incrementing: %d\n", count)
	}
	decrement := func() {
		lock.Lock()
		defer lock.Unlock()
		count--
		fmt.Printf("Decrementing: %d\n", count)
	}
	// 增量
	var arithmetic sync.WaitGroup
	for i := 0; i <= 5; i++ {
		arithmetic.Add(1)
		go func() {
			defer arithmetic.Done()
			increment()
		}()
	}
	// 减量
	for i := 0; i <= 5; i++ {
		arithmetic.Add(1)
		go func() {
			defer arithmetic.Done()
			decrement()
		}()
	}
	arithmetic.Wait()
	fmt.Println("Arithmetic complete.")
}
~~~

输出如下：

~~~
Incrementing: 1
Decrementing: 0
Decrementing: -1
Incrementing: 0
Decrementing: -1
Decrementing: -2
Incrementing: -1
Incrementing: 0
Arithmetic complete.
~~~

你会注意到，**我们总是在defer语句中调用Unlock。这是一个十分常见的习惯用法，它使用Mutex互斥锁来确保即使出现了panic,调用也总是发生。如果不这样做，可能会导致程序陷人死锁。**
关键部分之所以如此命名，是因为它们反映了程序中的瓶颈。进入和退出一个临界区是有消耗的，所以一般人会尽量减少在临界区的时间。
这样做的一个策略是减少临界区的范围。可能存在需要在多个并发进程之间共享内存的情况，但可能这些进程不是都需要读写此内存。
如果是这样，你可以利用不同类型的互斥对象：sync.RWMutex。

Sync.RWMutex在概念上和互斥是一样的：它守卫着对内存的访问，然而，RWMutex让你对内存有了更多控制。
你可以请求一个锁用于读处理，在这种情况下你将被授予访问权限，除非该锁被用于写处理。
这意味着，任意数量的读消费者可以持有一个读锁，只要没有共他事物持有一个写锁。
这里有一个例子，它演示了一个生产者，它不像代码中创建的众多消费者那样活跃：

~~~go
package main

import (
	"fmt"
	"math"
	"os"
	"sync"
	"text/tabwriter"
	"time"
)

func main() {
	producer := func(wg *sync.WaitGroup, l sync.Locker) { // 第二个参数是 sync.Locker 类型。这个接口有两个方法，Lock和Unlock。go包中有两个实现，sync.Mutex和sync.RWMutex。
		defer wg.Done()
		for i := 5; i > 0; i-- {
			l.Lock()
			l.Unlock()
			time.Sleep(1) // 让 producer 等待，使其比观察者的 goroutine 更不活跃。
		}
	}
	observer := func(wg *sync.WaitGroup, l sync.Locker) {
		defer wg.Done()
		l.Lock()
		defer l.Unlock()
	}
	test := func(count int, mutex, rwMutex sync.Locker) time.Duration {
		var wg sync.WaitGroup
		wg.Add(count + 1)
		beginTestTime := time.Now()
		go producer(&wg, mutex)
		for i := count; i > 0; i-- {
			go observer(&wg, rwMutex)
		}
		wg.Wait()
		return time.Since(beginTestTime)
	}
	tw := tabwriter.NewWriter(os.Stdout, 0, 1, 2, ' ', 0)
	defer tw.Flush()
	var m sync.RWMutex
	fmt.Fprintf(tw, "Readers\tRWMutext\tMutex\n")
	for i := 0; i < 20; i++ {
		count := int(math.Pow(2, float64(i)))
		fmt.Fprintf(
			tw,
			"%d\t%v\t%v\n",
			count,
			test(count, &m, m.RLocker()),
			test(count, &m, &m),
		)
	}
}
~~~

输出如下：

~~~
Readers  RWMutext    Mutex
1        76.0748ms   78.666ms
2        77.9551ms   77.8809ms
4        78.9414ms   77.7889ms
8        61.973ms    78.1634ms
16       77.1572ms   61.3356ms
32       62.9075ms   77.792ms
64       61.6918ms   76.5042ms
128      61.6087ms   77.0605ms
256      62.1438ms   77.894ms
512      62.8352ms   46.7669ms
1024     46.7329ms   47.4825ms
2048     46.5684ms   31.1086ms
4096     47.5138ms   62.2136ms
8192     7.0075ms    38.8685ms
16384    12.4982ms   4.732ms
32768    6.505ms     8.7366ms
65536    14.3337ms   16.2156ms
131072   32.3444ms   35.852ms
262144   58.6523ms   71.3403ms
524288   117.7048ms  147.1611ms
~~~

#### cond

对于cond类型的注释确实很好地描述了它的用途：
> ...一个goroutine的集合点，等待或发布一个event。

在这个定义中，一个“event”是两个或两个以上的goroutine之间的任意信号，除了它已经发生的事实外，没有任何信息。
通常情况下，在goroutine继续执行之前，你需要等待其中一个信号。如果我们要研究如何在没有Cond类型的情况下实现这一目标，一个简单的方法就是使用无限循环：`for conditionTrue() == false {}`
然而，这将消耗一个CPU核心的所有周期。为了解决这个问题，我们可以引入一个time.Sleep：`for conditionTrue() == false { time.Sleep(1*time.Millisecond) }`
这样更好，但它仍然是低效的，而且你必须弄清楚要等待多久：太长，会人为地降低性能：太短，会不必要地消耗太多的CPU时间。
如果有一种方法可以让goroutine有效地等待，直到它发出信号并检查它的状态，那就更好了。
这正是Cond类型为我们所做的。使用Cond,我们可以这样编写前面例子的代码：

~~~go
package main

import "sync"

func main() {
	c := sync.NewCond(&sync.Mutex{}) // 实例化一个cond。NewCond函数创建一个类型，满足sync.Locker接口。这使得cond类型能够以一种并发安全的方式与其他goroutine协调
	c.L.Lock()                       // 锁定这个条件。这是必要的，因为在进入Locker的时候，执行wait会自动执行unlock。
	for conditionTrue() == false {
		c.Wait() // 等待通知，条件已经发生。这是一个阻塞通信，goroutine将被暂停。
	}
	c.L.Unlock() // 为这个条件Locker执行解锁操作。这是必要的，因为当执行Wait退出操作的时候，它会在Locker上调用Lock方法。
}
~~~

这种方法效率更高。注意，调用Wait不只是阻塞，它挂起了当前的goroutine,允许其他goroutine在OS线程上运行。
当你调用Wait时，会发生一些其他事情：**进入Wait后，在Cond变量的Locker上调用Unlock方法，在退出Wait时，在Cond变量的Locker上执行Lock方法。**
它实际上是方法的一个隐藏的副作用。看起来我们在等待条件发生的时候一直持有这个锁，但事实并非如此。当你浏览代码时，你需要留意这个模式。

让我们扩展这个例子，并显示等式的两边：等待信号的goroutine和发送信号的goroutine。
假设我们有一个固定长度为2的队列，还有10个我们想要推送到队列中的项目。
我们想要在有房间的情况下尽快排队，所以就希望在队列中有空间时能立即得到通知。
让我们尝试使用Cond来管理这种调度：

~~~go
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {
	c := sync.NewCond(&sync.Mutex{})
	queue := make([]any, 0, 10)
	removeFromQueue := func(delay time.Duration) {
		time.Sleep(delay)
		c.L.Lock()
		queue = queue[1:]
		fmt.Println("Removed from queue")
		c.L.Unlock()
		c.Signal()
	}
	for i := 0; i < 10; i++ {
		c.L.Lock()
		for len(queue) == 2 {
			c.Wait()
		}
		fmt.Println("Adding to queue")
		queue = append(queue, struct{}{})
		go removeFromQueue(1 * time.Second)
		c.L.Unlock()
	}
}
~~~

输出如下：

~~~
Adding to queue
Adding to queue
Removed from queue
Adding to queue
Removed from queue
Adding to queue
Removed from queue
Adding to queue
Removed from queue
Adding to queue
Removed from queue
Removed from queue
Adding to queue
Adding to queue
Removed from queue
Adding to queue
Removed from queue
Adding to queue
~~~

该程序成功地将所有10个项目添加到队列中（并且在它有机会将前两项删除之前退出)。
它也总是等待，直到至少有一个项目被排入队列，然后再进行另一个项目。
在这个例子中，我们还有一个新方法，Signal。这是Cond类型提供的两种方法中的一种，**它提供通知goroutine阻塞的调用Wait,条件已经被触发。**
另一种方法叫做Broadcast。运行时内部维护一个FIFO列表，等待接收信号；**Signal发现等待最长时间的goroutine并通知它，而Broadcast向所有等待的goroutine发送信号。**
Broadcast可以说是这两种方法中比较有趣的一种，因为它提供了一种同时与多个goroutine通信的方法。
我们可以通过channel对信号进行简单的复制，但是重复调用Broadcast的行为将会更加困难。
此外，与利用channel相比，Cond类型的性能要高很多。

为了了解使用Broadcast的方法，让我们假设正在创建一个带有按钮的GUI应用程序。我们想注册任意数量的函数，当该按钮被单击时，它将运行。
Cond可以完美胜任，因为我们可以使用它的Broadcast方法通知所有注册的处理程序。让我们看看它的例子：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	// 定义 Button 类型，包含 Clicked 条件
	type Button struct {
		Clicked *sync.Cond
	}
	button := Button{Clicked: sync.NewCond(&sync.Mutex{})}
	// 定义订阅函数，提供注册函数以处理来自条件的信号的功能
	subscribe := func(c *sync.Cond, fn func()) {
		var goroutineRunning sync.WaitGroup
		goroutineRunning.Add(1)
		go func() {
			goroutineRunning.Done()
			c.L.Lock()
			defer c.L.Unlock()
			c.Wait()
			fn()
		}()
		goroutineRunning.Wait()
	}
	var clickRegistered sync.WaitGroup
	clickRegistered.Add(3)
	subscribe(button.Clicked, func() {
		fmt.Println("Maximizing window.")
		clickRegistered.Done()
	})
	subscribe(button.Clicked, func() {
		fmt.Println("Displaying annoying dialog box!")
		clickRegistered.Done()
	})
	subscribe(button.Clicked, func() {
		fmt.Println("Mouse clicked.")
		clickRegistered.Done()
	})
	button.Clicked.Broadcast()
	clickRegistered.Wait()
}
~~~

输出如下：

~~~
Mouse clicked.
Maximizing window.
Displaying annoying dialog box!
~~~

可以看到，在 Click Cond 上调用 Broadcast ，所有三个处理程序都将运行。
如果不是 clickRegistered 的 WaitGroup,我们可以调用button.Clicked.Broadcast()多次，并且.每次都调用三个处理程序。
这是channel不太容易做到的，因此是利用Cond类型的主要原因之一。

与sync包中所包含的大多数其他东西一样，Cond的使用最好被限制在一个紧凑的范围中，或者是通过封装它的类型来暴露在更大范围内。

#### once

once 比较简单，顾名思义：只会被执行一次。

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var count int
	increment := func() {
		count++
	}
	var once sync.Once
	var increments sync.WaitGroup
	increments.Add(100)
	for i := 0; i < 100; i++ {
		go func() {
			defer increments.Done()
			once.Do(increment)
		}()
	}
	increments.Wait()
	fmt.Printf("Count is %d\n", count)
}
~~~

输出为：`Count is 1`

sync.Once是一种类型，它在内部使用一些sync原语，以确保即使在不同的goroutine上，也只会调用一次Do方法处理传递进来的函数。
这确实是因为我们将调用sync.Once方式执行Do方法。

使用sync.Once有几件事需要注意。让我们看另一个例子，你认为它会打印什么？

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var count int
	increment := func() { count++ }
	decrement := func() { count-- }
	var once sync.Once
	once.Do(increment)
	once.Do(decrement)
	fmt.Printf("Count: %d\n", count)
}
~~~

输出如下：`Count: 1`

**sync.Once只计算调用Do方法的次数，而不是多少次唯一调用Do方法。**
这样，**sync.Once的副本与所要调用的函数紧密耦合**，我们再次看到如何在一个严格的范围内合理使用sync包中的类型以发挥最佳效果。
我建议你通过将sync.Once包装在一个小的语法块中来形式化这种耦合：要么是一个小函数，要么是将两者包装在一个结构体中。
这个例子你认为会发生什么？

~~~go
package main

import (
	"sync"
)

func main() {
	var onceA, onceB sync.Once
	var initB func()
	initA := func() { onceB.Do(initB) }
	initB = func() { onceA.Do(initA) } // 1
	onceA.Do(initA)                    // 2
}
~~~

1这个调用在2返回之前不能进行。
这个程序将会死锁，因为在1调用的Do直到2调用Do并退出后才会继续，这是死锁的典型例子。
对一些人来说，这可能有点违反直觉，因为它看起来好像我们使用的sync.Once是为了防止多重初始化，但sync.Once唯一能保证的是你的函数只被调用一次。
有时，这是通过死锁程序和暴露逻辑中的缺陷来完成的，在这个例子中是一个循环引用。

#### 池

池(Pool)是[Pool模式](https://zh.wikipedia.org/wiki/%E5%AF%B9%E8%B1%A1%E6%B1%A0%E6%A8%A1%E5%BC%8F)的并发安全实现。
在较高的层次上，Pool模式是一种创建和提供可供使用的固定数量实例或 Pool实例的方法。
它通常用于约束创建昂贵的场景（如数据库连接），以便只创建固定数量的实例，但不确定数量的操作仍然可以请求访问这些场景。
对于Go语言的sync.Pool,这种数据类型可以被多个goroutine安全地使用。

Pool的主接口是它的Get方法。当调用时，Get将首先检查池中是否有可用的实例返回给调用者，如果没有，调用它的new方法来创建一个新实例。
当完成时，调用者调用Put方法把工作的实例归还到池中，以供其他进程使用。
这里有一个简单的例子来说明：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	myPool := &sync.Pool{
		New: func() any {
			fmt.Println("Creating new instance.")
			return struct{}{}
		}}
	myPool.Get()             // 调用 Pool 的 get 方法，会执行 Pool 中定义的 New 函数，因为实例还没有实例化。 
	instance := myPool.Get() // 同上
	myPool.Put(instance)     // 将之前的实例放回池中，增加了池内可用数量。
	myPool.Get()             // 再调用时，会重用之前的示例，不会调用 New 函数。
}
~~~

我们只看到两个对New函数的调用：

~~~
Creating new instance.
Creating new instance.
~~~

那么，为什么要使用 Pool,而不只是在运行时实例化对象呢？Go语言是有 GC 的，因此实例化的对象将被自动清理。
有什么意义？考虑下面这个例子：

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	var numCalcsCreated int
	calcPool := &sync.Pool{
		New: func() any {
			numCalcsCreated += 1
			mem := make([]byte, 1024)
			return &mem // 存储bytes切片的地址
		},
	}
	// 用4KB初始化 pool
	calcPool.Put(calcPool.New())
	calcPool.Put(calcPool.New())
	calcPool.Put(calcPool.New())
	calcPool.Put(calcPool.New())
	const numWorkers = 1024 * 1024
	var wg sync.WaitGroup
	wg.Add(numWorkers)
	for i := numWorkers; i > 0; i-- {
		go func() {
			defer wg.Done()
			mem := calcPool.Get().(*[]byte)
			defer calcPool.Put(mem)
			// 做一些有趣的假设，但是很快就会用这个内存完成
		}()
	}
	wg.Wait()
	fmt.Printf("%d calculators were created.", numCalcsCreated)
}
~~~

输出如下：`23 calculators were created.`
如果我没有用sync.Pool运行这个例子，尽管结果是不确定的，在最坏的情况下，我可能尝试分配一个十亿字节的内存，但是正如你从输出看到的，我只分配了4KB。
另一种常见的情况是，用Pool来尽可能快地将预先分配的对象缓存加载启动。在这种情况下，我们不是试图通过限制创建的对象的数量来节省主机的内存，而是通过提前加载获取引用到另一个对象所需的时间，来节省消费者的时间。
这在编写高吞吐量网络服务器时十分常见，服务器试图快速响应请求。让我们来看看这样的场景。
首先，让我们创建一个模拟创建到服务的连接的函数。我们会让这次连接花很长时间：

~~~go
package main

import "time"

func connectToService() any {
	time.Sleep(1 * time.Second)
	return struct{}{}
}
~~~

接下来，让我们了解一下，如果服务为每个请求都启动一个新的连接，那么网络服务的性能如何。
我们将编写一个网络处理程序，为每个请求都打开一个新的连接。
为了使基准测试简单，我们只允许一次连接：

~~~go
package main

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

func startNetworkDaemon() *sync.WaitGroup {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		server, err := net.Listen("tcp", "localhost:8080")
		if err != nil {
			log.Fatalf("cannot listen:%v", err)
		}
		defer server.Close()
		wg.Done()
		for {
			conn, err := server.Accept()
			if err != nil {
				log.Printf("cannot accept connection:%v", err)
				continue
			}
			connectToService()
			fmt.Fprintln(conn, "")
			conn.Close()
		}
	}()
	return &wg
}

func connectToService() any {
	time.Sleep(1 * time.Second)
	return struct{}{}
}
~~~

现在我们的基准如下：

~~~go
package main

import (
	"io/ioutil"
	"net"
	"testing"
)

func init() {
	daemonStarted := startNetworkDaemon()
	daemonStarted.Wait()
}

func BenchmarkNetworkRequest(b *testing.B) {
	for i := 0; i < b.N; i++ {
		conn, err := net.Dial("tcp", "localhost:8080")
		if err != nil {
			b.Fatalf("cannot dial host:%v", err)
		}
		if _, err := ioutil.ReadAll(conn); err != nil {
			b.Fatalf("cannot read:%v", err)
		}
		conn.Close()
	}
}
~~~

输出如下：

~~~
BenchmarkNetworkRequest
BenchmarkNetworkRequest-20    	      10	1010578820 ns/op
PASS
~~~

看看 sync.Pool 改进的：

~~~go
package main

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

func main() {

}
func warmServiceConnCache() *sync.Pool {
	p := &sync.Pool{
		New: connectToService,
	}
	for i := 0; i < 10; i++ {
		p.Put(p.New())
	}
	return p
}

func startNetworkDaemon() *sync.WaitGroup {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		connPool := warmServiceConnCache()
		server, err := net.Listen("tcp", "localhost:8080")
		if err != nil {
			log.Fatalf("cannot listen:%v", err)
		}
		defer server.Close()
		wg.Done()
		for {
			conn, err := server.Accept()
			if err != nil {
				log.Printf("cannot accept connection:%v", err)
				continue
			}
			svcConn := connPool.Get()
			fmt.Fprintln(conn, "")
			connPool.Put(svcConn)
			conn.Close()
		}
	}()
	return &wg
}

func connectToService() any {
	time.Sleep(1 * time.Second)
	return struct{}{}
}
~~~

输出如下：

~~~
BenchmarkNetworkRequest
BenchmarkNetworkRequest-20    	    3800	   4567334 ns/op
PASS
~~~

快了三个数量级，在处理代价昂贵的事务时使用这种模式可以极大的提高响应时间。

当你的并发进程需要请求一个对象，但是在实例化之后很快地处理它们时，或者在这些对象的构造可能会对内存产生负面影响，这时最好使用Pool设计模式。
然而，有些情况下要谨慎决定你是否应该使用Pool:如果你使用Pool代码所需要的东西不是大概同质的，那么从Pool中转化检索到所需要的内容的时间可能比重新实例化内容要花费的时间更多。
例如，如果你的程序需要随机和可变长度的切片，那么Pool将不会对你有多大帮助。你直接从Pool中获得一个正确的切片的概率是很低的。

所以当你使用Pool工作时，记住以下几点：

* 当实例化sync.Pool,使用new方法创建一个成员变量，在调用时是线程安全的。
* 当你收到一个来自 Get 的实例时，不要对所接收的对象的状态做出任何假设。
* 当你用完了一个从Pool中取出来的对象时，一定要调用Put,否则，Pool就无法复用这个实例了。通常情况下，这是用defer完成的。
* Pool内的分布必须大致均匀。

### Channel

channel是由Hoare的CSP派生的同步原语之一。
虽然它们可以用来同步内存访问，但它们最好用于在goroutine之间传递信息。
正如我们在第2章“Go语言的并发哲学”中所讨论的，在任何大小的程序中，channel都非常有用，因为它们可以组合在一起。

就像河流一样，一个channel充当着信息传送的管道，值可以沿着channel传递，然后在下游读出。
当你使用channel时，你会将一个值传递给一个chan变量，然后你程序中的某个地方将它从channel中读出。
程序中不同的部分不需要相互了解，只需要在channel所在的内存中引用相同的位置即可。这可以通过对程序上下游的channel引用来完成。

创建一个channel非常简单。使用内置的make函数：`dataChan := make(chan any)` 这是一个双向的channel。
channel也可以声明为只支持单向的数据流，也就是说，可以定义一个channel只支持发送或接收信息：`dataChan := make(chan<- any)` or `dataChan := make(<-chan any)`
通过 `<-` 的方向来区分，还是非常直观的。

但我们通常不会看到单向channel实例化，但是会经常看到它们用作函数参数和返回类型。
**当需要时，Go语言会隐式地将双向channel转换为单向channel。**
这里有一个例子：

~~~go
var receiveChan <-chan any
var sendChan chan<- any
dataStream := make(chan any)
// 有效的语法：
receiveChan = datastream
sendChan = dataStream
~~~

使用 channel 也是通过 `<-` 操作符来完成。
将数据放到channel中：`dataChan <- data`
从channel中读取数据：`data := <-dataChan`

尝试向只读的channel写数据会报错：`invalid operation: cannot send to receive-only channel readOnlyCh (variable of type <-chan int)`
尝试从只写的channel读数据会报错：`invalid operation: cannot receive from send-only channel writeOnlyCh (variable of type chan<- int)`
这是Go语言的类型系统的一部分，它允许我们在处理并发原语时使用type-safety。

**Go语言中的channel是阻塞的。**
这意味着只有 channel 内的数据被消费后，新的数据才能写入，而任何试图从空channel 读取数据的goroutine将等待至少一条数据被写入channel后才能读到。

如果不正确地构造程序，这会导致死锁：

~~~go
package main

import (
	"fmt"
)

func main() {
	stringStream := make(chan string)
	go func() {
		if 0 != 1 {
			return
		}
		stringStream <- "Hello channels!"
	}()
	fmt.Println(<-stringStream)
}
~~~

**通过 `<-` 操作符的接受形式也可以选择返回两个值：`data, ok := <-dataChan`**
**ok 是一个布尔值。当channel关闭时，ok为false，data为零值。当channel开启时，ok为true，data为channel中存储的值。如果没有数据，则会阻塞。**
**使用 `close(dataChan)` 关闭一个channel。**

这为我们提供了一些新的模式。
第一个是从channel中获取。通过range关键作为参数遍历（与for语句一起使用），并且**在channel关闭时自动中断循环。**
这允许对channel上的值进行简洁的迭代。让我们看一个例子：

~~~go
package main

import "fmt"

func main() {
	intstream := make(chan int)
	go func() {
		// 我们确保在goroutine退出之前channel是关闭的。这是一个很常见的模式。
		defer close(intstream)
		for i := 1; i <= 5; i++ {
			intstream <- i
		}
	}()
	// 遍历了 intstream
	for integer := range intstream {
		fmt.Printf("%v ", integer)
	}
}
~~~

运行结果：`1 2 3 4 5 `

**注意该循环不需要退出条件，并且 range 方法不返回第二个布尔值。处理一个已关闭的 channel 的细节可以让你保持循环简洁。**

**关闭 channel 也是一种同时给多个 goroutine 发信号的方法。** 如果有 n 个 goroutine 在一个 channel 上等待，而不是在 channel 上写 n 次来打开每个 goroutine,你可以简单地关闭 channel。
由于一个被关闭的 channel 可以被无数次读取，所以不管有多少 goroutine 在等待它，关闭 channel 都比执行 n 次更适合，也更快。
这里有一个例子，可以同时打开多个 goroutine:

~~~go
package main

import (
	"fmt"
	"sync"
)

func main() {
	begin := make(chan any)
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-begin // goroutine会一直等待，直到它被告知可以继续。
			fmt.Printf("%v has begun\n", i)
		}(i)
	}
	fmt.Println("Unblocking goroutines...")
	close(begin) // 关闭channel,从而同时打开所有的goroutine。
	wg.Wait()
}
~~~

你可以看到，在我们关闭开始channel之前，所有的goroutine都没有开始运行：

~~~
Unblocking goroutines...
4 has begun
2 has begun
3 has begun
o has begun
1 has begun
~~~

请记住在本章前面“sync包”中，我们讨论了使用sync.Cond类型执行相同的行为。你当然可以使用它，但是正如我们已经讨论过的，channel是可组合的。
我们还可以创建 buffered channel,它是在实例化时提供容量的 channel。
这意味着即使没有在 channel 上执行读取操作，goroutine 仍然可以执行 n 写入，其中 n 是缓冲 channel 的容量。
**`dataChan := make(chan any, 4)`创建一个有4个容量的缓冲channel。** 这意味着我们可以把4个东西放到 channel 上，不管它是否被读取。
这有点意思，因为它意味着 goroutine 可以控制实例化一个 channel 时否需要缓冲。这表明，创建一个 channel 应该与 goroutines 紧密耦合，而 goroutines 将会在它上面执行写操作，这样我们就可以更容易地推断它的行为和性能。

没有缓冲的 channel 也被定义为缓冲 channel,一个无缓冲channel只是一个以0的容量创建的缓冲channel。
**`a := make(chan any)`和`b := make(chan any, 0)` 是等价的。**
请记住，当我们讨论阻塞时，如果说 channel 是满的，那么写入 channel 阻塞，如果 channel 是空的，则从 channels 读取的是什么？
“Full”和“empty”是容量或缓冲区大小的函数。无缓冲channel的容量为零，因此在任何写人之前channel已经满了。
一个没有下游接受的容量为4的缓冲channel在被写4次之后就满了，并且在写第5次的时候阻塞，因为它没有其他地方放置第五个元素。
与未缓冲的channel一样，缓冲channel仍然阻塞；channel为空或满的前提条件是不同的。
通过这种方式，缓冲channel是一个内存中的FIFO队列，用于并发进程进行通信。

为了帮助理解这一点，让我们用例子来解释一个具有4个容量的缓冲 channel 的情况。
首先，让我们来初始化： `c ：= make(chan rune, 4)`
从逻辑上讲，这创建了一个带有四个槽的缓冲区。现在让我们往channel里写数据： `c <- 'A'`
当这个channel没有下游读取时，一个数据将被放置在channel缓冲区的第一个槽中。
然后 `c <- 'B'`、`c <- 'C'`、`c <- 'D'`，经过4次写入后，缓冲区已满。
再试图写入 `c <- 'E'`，执行这个写入操作的 goroutine 将被阻塞，直到有读取操作。
下游读取时会依次接受位于缓冲区中的数据，直到缓冲区为空。

如果一个缓冲 channel 是空的，并且有一个下游接收，那么缓冲区将被忽略，并且该值将直接从发送方传递到接收方。
在实践中这是透明的，但是对了解缓冲channel的配置是值得的。缓冲 channel 在某些情况下是有用的，但是应该小心地创建它们。
**缓冲channel很容易成为一个不成熟的优化，并且使隐藏的死锁更不容易发生。这听起来像是一件好事，但我猜你宁愿在第一次写代码的时候发现死锁，而不是在生产系统崩遗的时候才发现。**

程序如何与值为 nil 的 channel 交互？

~~~go
var dataStream chan interface{}
// 读取
<-dataStream
// 写入
dataStream <- struct{}{}
~~~

会报错：`fatal error: all goroutines are asleep - deadlock!`
尝试`close(dataStream)`也会报错：`panic: close of nil channel`

--- 

channel 操作的结果给出了 channel 的状态：

| 操作    | Channel 状态 | 结果                                 |
|-------|------------|------------------------------------|
| Read  | nil        | 阻塞                                 |
| Read  | 打开且非空      | 输出值                                |
| Read  | 打开且空       | 阻塞                                 |
| Read  | 关闭         | <默认值>,false                        |
| Read  | 只写         | 编译错误                               |
| Write | nil        | 阻塞                                 |
| Write | 打开但填满      | 阻塞                                 |
| Write | 打开且不满      | 写入值                                |
| Write | 关闭         | panic                              |
| Write | 只读         | 编译错误                               |
| Close | nil        | panic                              |
| Close | 打开且非空      | 关闭Channel，读取成功，直到缓存被读完，然后读取生产者的默认值 |
| Close | 打开且空       | 关闭Channel，读取生产者的默认值                |
| Close | 关闭         | panic                              |
| Close | 只读         | 编译错误                               |

channel是吸引人们使用Go语言的原因之一。
结合了goroutine和闭包的简单性，我很清楚地知道编写干净、正确的并发代码是多么容易。
在很多方面，channel是将goroutine黏合在一起的黏合剂。
本章应该给了你一个关于什么是channel以及如何使用它们的很好的概述。
真正的乐趣始于我们开始编写channel以形成高阶并发设计模式。我们会在下一章讲到。

期待。

### select 语句

select语句是将channel绑定在一起的黏合剂，这就是我们如何在一个程序中组合channel以形成更大的抽象事务的方式。
声明select语句是一个具有并发性的Go语言程序中最重要的事情之一，这并不是夸大共词。
在一个系统中两个或多个组件的交集中，可以在本地、单个函数或类型以及全局范围内找到select语句绑定在一起的channel。
除了连接组件之外，在程序中的这些关键节点上，select语句可以帮助安全地将channel与诸如取消、超时、等待和默认值之类的概念结合在一起。

那么这些强大的select语句是什么呢？我们如何使用它们，它们是如何工作的？
让我们先把它放出来。这里有一个很简单的例子：

~~~go
package main

func main() {
	var c1, c2 <-chan any
	var c3 chan<- any
	select {
	case <-c1:
		//执行某些逻辑
	case <-c2:
		//执行某些逻辑
	case c3 <- struct{}{}:
		// 执行某些逻辑
	}
}
~~~

它看起来有点像一个选择模块，一个select模块包含一系列的case语句，这些语句可以保护一系列语句。
然而，这就是相似之处。**与switch块不同，select块中的case语句没有测试顺序，如果没有满足任何条件，执行也不会失败。**

相反，所有的channel读取和写入都需要查看是否有任何一个已准备就绪可以用的数据：在读取的情况下关闭channel,以及写入不具备下游消费能力的channel。
如果所有channel都没有谁备好，则执行整个select语句模块。当一个channel准备好了，这个操作就会继续，它相应的语句就会执行。
让我们来看一个简单的例子：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	start := time.Now()
	c := make(chan any)
	go func() {
		// 等待5s后关闭channel
		time.Sleep(5 * time.Second)
		close(c)
	}()
	fmt.Println("Blocking on read...")
	select {
	case <-c:
		// 尝试在channel上读取数据
		fmt.Printf("Unblocked %v later.\n", time.Since(start))
	}
}
~~~

输出如下：

~~~
Blocking on read...
Unblocked 5.0109829s later.
~~~

在进人select模块后大约5秒，我们就会解锁。这是一种简单而有效的方法来阻止我们等待某事的发生，但如果我们思考一下，我们可以提出一些问题：

* 当多个channel有数据可供给下游读取的时候会发生什么？
* 如果没有任何可用的channel怎么办？
* 如果我们想要做一些事情，但是没有可用的channels怎么办？

~~~go
package main

import (
	"fmt"
)

func main() {
	c1 := make(chan any)
	close(c1)
	c2 := make(chan any)
	close(c2)
	var c1Count, c2Count int
	for i := 1000; i > 0; i-- {
		select {
		case <-c1:
			c1Count++
		case <-c2:
			c2Count++
		}
	}
	fmt.Printf("c1Count:%d\nc2Count:%d\n", c1Count, c2Count)
}
~~~

输出如下：

~~~
c1Count:485
c2Count:515
~~~

在一千次迭代中，大约有一半的时间从c1读取se1ect语句，大约一半的时间从c2读取。这看起来很有趣，也许有点太巧了。事实如此！
**Go 语言运行时将在一组case语句中执行伪随机选择。这就意味着，在你的case语句集合中，每一个都有一个被执行的机会。**
乍一看，这似乎并不重要，但背后的原因却非常有趣。
让我们先做一个很明显的阐述：Go语言运行时无法解析select语句的意图，也就是说，它不能推断出问题空间，或者说为什么将一组channel组合到一个select语句中。正因为如此，运行时所能做的最好的事情就是在平均情况下运行良好。
一种很好的方法是将一个随机变量引入到等式中（在这种情况下，se1ect后续的channel)。通过加权平均每个channel被使用的机会，所有使用select语句的程序将在平均情况下表现良好。

关于第二个问题：如果没有任何channel可用，会发生什么？如果所有的channel都被阻塞了，如果没有可用的，但是你可能不希望永远阻塞，可能需要超时机制。
Go语言的time包提供了一种优雅的方式，可以在select语句中很好地使用channel。
这里有一个例子：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	var c <-chan int
	select {
	case <-c:
	case <-time.After(1 * time.Second):
		fmt.Println("Timed out.")
	}
}
~~~

这个case语句永远不会被解锁，因为我们是从 nil channel 读取的。
输出如下：`Timed out.`
time.After 函数通过传入 time.Duration 参数返回一个数值并写入 channel,该channel会返回执行后的时间。这为select语句提供了一种简明的方法。

最后一个问题：当没有可用channel时，我们需要做些什么？
像case语句一样，select语句也允许默认的语句。就像“case”语句一样，当“select'”语句中的所有channel都被阻塞的时候，“select”语句也允许你调用默认语句。
以下是一个实例：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	start := time.Now()
	var c1, c2 <-chan int
	select {
	case <-c1:
	case <-c2:
	default:
		fmt.Printf("In default after %v\n", time.Since(start))
	}
}
~~~

输出如下：`In default after 0s`
可以看到，它几乎是瞬间运行了默认语句。这允许在不阻塞的情况下退出 select 模块。
通常，你将看到一个默认的子句，它与 for-select 循环一起使用。
这允许goroutine在等待另一个goroutine上报结果的同时，可以继续执行自己的操作。
这里有一个例子：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	done := make(chan interface{})
	go func() {
		time.Sleep(5 * time.Second)
		close(done)
	}()
	workCounter := 0
loop:
	for {
		select {
		case <-done:
			break loop
		default:
		}
		// 模拟工作行为
		workCounter++
		time.Sleep(1 * time.Second)
	}
	fmt.Printf("Achieved %v cycles of work before signalled to stop.\n", workCounter)
}
~~~

输出如下：`Achieved 5 cycles of work before signalled to stop.`

在这种情况下，我们有一个循环，它在执行某种操作，偶尔检查它是否应该被停止。
最后，对于空的select语句有一个特殊的情况：选择没有case子句的语句。
看起来像这样： `select {}` 这个语句将永远阻塞。
在第6章中，我们将深入研究select语句是如何工作的。从更高层次的角度来看，它应该是显而易见的，它可以帮助你安全高效地组合各种概念和子系统。

### GOMAXPROCS 控制

在runtime包中，有一个函数称为GoMAXPR0CS。
这个名称是有误导性的：人们通常认为这个函数与主机上的逻辑处理器的数量有关（而且与它调度方式有关)，但实际上这个函数控制的OS线程的数量将承载所谓的“工作队列”。
有关这个函数的更多信息以及它的工作原理，请参见第6章。
在Go语言1.5之前，GoMAXPR0CS总是被设置为1，通常你会在大多数Go语言程序中找到这段代码：`runtime.GOMAXPROCS(runtime.NumCPU())`
几乎大部分开发人员希望当他们的程序正在运行时，可以充分利用机器上的所有CPU核心。~~（我还真干过）~~
因此，在随后的Go语言版本中，它自动设置为主机上逻辑CPU的数量。

那么为什么要调整这个值呢？大部分时间你都不太想去调节它。
**Go语言的调度算法在大多数情况下已经足够好了，在增加或减少工作队列和线程数量的情况下，可能会造成更多的问题，但是仍然有一些情况会改变这个值。**
例如，我在一个项目上调试，这个项目有一个测试组件，它被竞争环境困扰。
不管怎么说，这个团队有几个包，有时候测试失败。我们运行测试的主机有四个逻辑CPU,因此在任何一个点上，我们都有四个goroutines同时执行。
通过增加GoMAXPROCS以超过我们拥有的逻辑CPU数量，我们能够更频繁地触发竞争条件，从而更快地修复它们。

其他人可能通过实验发现，他们的程序在一定数量的工作队列和线程上运行得更好，但我更主张谨慎些。
如果你通过调整这个方法来压缩性能，那么在每次提交之后，当你使用不同的硬件，以及使用不同版本的Go语言时，一定要这样做。
调整这个值会使你的程序更接近它所运行的硬件，但以抽象和长期性能稳定为代价。

