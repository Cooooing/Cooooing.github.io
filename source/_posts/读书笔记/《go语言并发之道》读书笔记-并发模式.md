---
layout: post
title: 《go语言并发之道》读书笔记-并发模式
date: 2025-01-21 12:41:17
categories:
  - 读书笔记
tags:
  - 《go语言并发之道》
  - go
  - 并发
mathjax: true
---

## 第四章 - Go语言的并发模式

前面讲了Go语言的并发原语的基本原理，这章要讨论如何将它们组合成模式，以帮助保持系统的可拓展性和可维护性。

### 约束

在编写并发代码的时候，有以下几种不同的保证操作安全的方法。我们已经介绍了其中两个：

* 用于共享内存的同步原语（如sync.Mutex)。
* 通过通信共享内存来进行同步（如channel)。

但是，在并发处理中还有其他几种情况也是隐式并发安全的：

* 不会发生改变的数据。
* 受到保护的数据。

从某种意义上讲，不可变数据是理想的，因为它是隐式地并行安全的。每个并发进程可能对相同的数据进行操作，但不能对其进行修改。
如果要创建新数据，则必须创建具有所需修改的数据的新副本。这不仅可以减轻开发人员的认知负担，并且可以使程序运行得更快，这将使程序的临界区减少（或者完全消除临界区)
在G0语言中，可以通过编写利用值的副本而不是指向内存值的指针的代码来实现此目的。有些语言支持使用明确不变的值的指针，然而，G0语言不在其中。
“约束”还可以使开发人员减少临界区的长度以及承担更小的认知负担。约束并发值的技术比简单传递值的副本要复杂一点，所以本章我们将深入介绍这些约束技术。

“约束”是一种确保了信息只能从一个并发过程中获取到的简单且强大的方法。达到此目的时，并发程序隐式安全，不需要同步。
有两种可能的约束：特定约束和词法约束。

特定约束是指通过公约实现约束时，无论是由语言社区、你所在的团队，还是你的代码库设置。
坚持约束很难在任何规模的项目上进行协调，除非你有工具在每次有人提交代码时对你的代码进行静态分析。（因为每个人开发习惯和理解不一致，导致基本是不可能的事）

词法约束涉及使用词法作用域仅公开用于多个并发进程的正确数据和并发原语。这使得做错事是不可能的。实际上我们已经在第3章中谈到了这个主题。
回想一下 channel 部分，它讨论的只是将 channel 的读或写处理暴露给需要它们的并发进程。因为 channel 是并发安全的。
下面看一个不是并发安全的数据结构约束的例子，他是一个 bytes Buffer 的实例：

~~~go
package main

import (
	"bytes"
	"fmt"
	"sync"
)

func main() {
	printData := func(wg *sync.WaitGroup, data []byte) {
		defer wg.Done()
		var buff bytes.Buffer
		for _, b := range data {
			fmt.Fprintf(&buff, "%c", b)
		}
		fmt.Println(buff.String())
	}
	var wg sync.WaitGroup
	wg.Add(2)
	data := []byte("golang")
	go printData(&wg, data[:3])
	go printData(&wg, data[3:])
	wg.Wait()
}
~~~

在这个例子中，你可以看到，因为 printData 没有对切片数据进行封装或保护。
**但因为传递的是切片的不同子集，且不重合。** 所以可以通过不用通过通信完成内存访问同步或共享数据。

那么有什么意义呢？如果我们有同步功能，为什么要约束？答案是提高了性能并降低了开发人员的认知负担。
同步带来了成本，如果你可以避免它，你将不会有任何临界区，因此你不必为同步它们付出任何成本。
你也可以通过同步回避所有可能的问题，开发人员根本不必担心这些问题。
利用词法约束的并发代码通常比不具有词法约束变量的并发代码更易于理解。这是因为在你的词法范围内，你可以编写同步代码。
但建立约束可能很困难。

### for-select 循环

向 channel 发送迭代变量
通常情况下，你需要将可迭代的内容转换为channel上的值。这不是什么幻想，通常看起来像这样：

~~~
	for _, s := range []string{"a", "b", "c"} {
		select {
		case <-done:
			return
		case stringStream <- s:
			// ...
		}
	}
~~~

循环等待停止
创建循环，无限循环直到停止的goroutine很常见。这个有一些变化。你选择哪一个纯粹是一种个人爱好。
第一种变体保持select语句尽可能短：

~~~
	for {
		select {
		case <-done:
			return
		default:
		}
		// 进行非抢占式任务
	}
~~~

如果已经完成的 channel 未关闭，我们将退出 select 语句并继续执行 for 循环的其余部分。

第二种变体将工作嵌入到选择语句的默认子句中：

~~~
	for {
		select {
		case <-done:
			return
		default:
			// 进行非抢占式任务
		}
	}
~~~

当我们输入 select 语句时，如果完成的 channel 尚未关闭，我们将执行 default 子句。
这种模式没有什么别的了，但它在任何地方都会被用到，所以值得一提。

### 防止goroutine泄漏

goroutine 是廉价且易于创建，这是让Go语言这么富有成效的原因之一。运行时将多个 goroutine 复用到任意数量的操作系统线程，以便我们不必担心该抽象级别。
但是 goroutine 还是需要消耗资源，而且 **goroutine 不会被运行时垃圾回收**，所以无论goroutine所占用的内存有多么的少，我们都不希望我们的进程对此没有感知。
那么我们如何去确保他们被清理干净？

goroutine有以下几种方式被终止：

* 当它完成了它的工作。
* 因为不可恢复的错误，它不能继续工作。
* 当它被告知需要终止工作。

我们可以很简单地使用前两种方法，因为这两种方法就隐含在你的算法中，
但是“取消工作”又是怎样工作的呢？由于网络的影响，事实证明这是最重要的一点：
如果你开始了一个goroutine,最有可能以某种有组织的方式与其他几个goroutine合作。
我们甚至可以将这种相互连接表现为一个图表：**子 goroutine 是否应该继续执行可能是以许多其他goroutine状态的认知为基础的。**

goroutine(通常是main goroutine)具有这种完整的语境知识应该能够告诉其子goroutine终止。
让我们从一个简单的goroutine泄漏开始：

~~~go
package main

import (
	"fmt"
)

func main() {
	doWork := func(strings <-chan string) <-chan any {
		completed := make(chan any)
		go func() {
			defer fmt.Println("dowork exited.")
			defer close(completed)
			for s := range strings {
				// 做些有趣的操作
				fmt.Println(s)
			}
		}()
		return completed
	}
	doWork(nil)
	// 也许这里有其他的操作需要进行
	fmt.Println("Done.")
}
~~~

在这里，我们看到 main goroutine 将一个空的 channel 传递给了 doWork。
因此，字符串channel永远不会写入任何字符串，并且包含doWork的goroutine将在此过程的整个生命周期中保留在内存中（如果我们在doWork和main goroutine中加入了goroutine,甚至会死锁)。
在这个例子中，这个过程的生命周期很短，但是在一个真正的程序中，goroutine可以很容易地在一个长期生命的程序开始时启动。
在最糟糕的情况下，main goroutine 可能会在其生命周期内持续的将其他的 goroutine 设置为自旋，这会导致内存利用率的下降。

成功减轻这种情况的方法是在父goroutine和其子goroutine之间建立一个信号，让父goroutine向其子goroutine发出信号通知。
按照惯例，这个信号通常是一个名为done的只读channel。父goroutine将该channel传递给子goroutine,然后在想要取消子goroutine时关闭该channel。例如：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	doWork := func(
	// 在这里，我们将完成的channel传递给doWork函数。作为惯例，这个 channel 是第一个参数。
		done <-chan any,
		strings <-chan string,
	) <-chan any {
		terminated := make(chan any)
		go func() {
			defer fmt.Println("dowork exited.")
			defer close(terminated)
			for {
				select {
				case s := <-strings:
					//做一些有意思的操作
					fmt.Println(s)
				case <-done: // 在这一行上，我们看到了在实际编程中无处不在的select模式。我们的一个案例陈述是检查我们的done channel是否已经发出信号。如果有的话，我们从goroutine返回。
					return
				}
			}
		}()
		return terminated
	}
	done := make(chan any)
	terminated := doWork(done, nil)
	// 在这里我们创建另一个goroutine,如果超过1s就会取消doWork中产生的goroutine.
	go func() {
		// 在1秒之后取消本操作
		time.Sleep(1 * time.Second)
		fmt.Println("Canceling dowork goroutine...")
		close(done)
	}()
	<-terminated
	fmt.Println("Done.")
}
~~~

输出如下:

~~~
Canceling dowork goroutine...
dowork exited.
Done.
~~~

这可以成功地消除 goroutine 的泄漏。

前面的例子很好地处理了在channel上接收goroutine的情况，但是如果我们正在处理相反的情况：
一个goroutine阻塞了向channel进行写入的请求？以下是演示此问题的简单示例：

~~~go
package main

import (
	"fmt"
	"math/rand"
)

func main() {
	newRandStream := func() <-chan int {
		randStream := make(chan int)
		go func() {
			defer fmt.Println("newRandStream closure exited.") // 这里我们在goroutine成功终止时打印出一条消息。
			defer close(randStream)
			for {
				randStream <- rand.Int()
			}
		}()
		return randStream
	}
	randStream := newRandStream()
	fmt.Println("3 random ints:")
	for i := 1; i <= 3; i++ {
		fmt.Printf("%d: %d\n", i, <-randStream)
	}
}
~~~

输出如下:

~~~
3 random ints:
1: 3655305211868055039
2: 1249578273512689196
3: 5508016884678521403
~~~

可以从输出中看到defer语句中的fmt.Println语句永远不会运行。
在循环的第三次迭代之后，我们的goroutine试图将下一个随机整数发送到不再被读取的channel。我们无法告诉生产者它可以停止。
解决方案就像接收案例一样，为生产者goroutine提供一个通知它退出的channel:

~~~go
package main

import (
	"fmt"
	"math/rand"
	"time"
)

func main() {
	newRandStream := func(done <-chan any) <-chan int {
		randStream := make(chan int)
		go func() {
			defer fmt.Println("newRandStream closure exited.") // 这里我们在goroutine成功终止时打印出一条消息。
			defer close(randStream)
			for {
				select {
				case <-done:
					return
				case randStream <- rand.Int():
					// ...
				}
			}
		}()
		return randStream
	}
	done := make(chan any)
	randStream := newRandStream(done)
	fmt.Println("3 random ints:")
	for i := 1; i <= 3; i++ {
		fmt.Printf("%d: %d\n", i, <-randStream)
	}
	close(done)
	// 模拟耗时操作
	time.Sleep(1 * time.Second)
}
~~~

输出如下:

~~~
3 random ints:
1: 6235326924859206075
2: 5955475684025182616
3: 8355754141677034465
newRandStream closure exited.
~~~

现在goroutine已经被正确地清理了。

现在我们知道如何确保goroutine不泄漏，我们可以规定一个约定：**如果 goroutine 负责创建 goroutine,它也负责确保它可以停止 goroutine。**
这个约定有助于确保你的程序在组合和扩展时可以扩展。

### or-channel

有时你可能会发现自己希望将一个或多个完成的 channel 合并到一个完成的 channel 中，该 channel 在任何组件 channel 关闭时关闭。
编写一个执行这种耦合的选择语句是完全可以接受的，尽管很冗长。但是，有时你无法知道你在运行时使用的已完成的channel的数量。
在这种情况下，或者如果你只喜欢单线程，你可以使用or-channel模式将这些channel组合在一起。

这种模式通过递归和goroutine创建一个复合done channel。我们来看一下：

~~~go
package main

func main() {
	var or func(channels ...<-chan any) <-chan any
	or = func(channels ...<-chan any) <-chan any { // 在这里，我们有我们的函数，或者，它采用可变的channel切片并返回单个channel
		switch len(channels) {
		case 0: // 由于这是一个递归函数，我们必须设置终止标准。首先，如果可变切片是空的，我们只返回一个空channel。这是由于不传递channel的观点所产生的，我们不希望复合的channel做任何事情.
			return nil
		case 1: // 我们的第二个终止标准是如果我们的变量切片只包含一个元素，我们只返回该元素。
			return channels[0]
		}
		orDone := make(chan any)
		go func() { // 这是函数的主体，以及递归发生的地方。我们创建了一个goroutine,以便我们可以不受阻塞地等待我们channel上的消息。
			defer close(orDone)
			switch len(channels) {
			case 2: // // 基于我们进行迭代的方式，每一次迭代调用都将至少有两个channel。在这里我们为需要两个channel的情况采用了约束goroutine数目的优化方法。
				select {
				case <-channels[0]:
				case <-channels[1]:
				}
			default:
				select {
				case <-channels[0]:
				case <-channels[1]:
				case <-channels[2]:
				case <-or(append(channels[3:], orDone)...): // 在这里，我们在循环到我们存放所有channel的slice的第三个索引的时候，我们创建了一个or-channel并从这个channel中选择了一个。这将形成一个由现有slice的剩余部分组成的树并且返回第一个信号量。为了使在建立这个树的goroutine退出的时候在树下的goroutine也可以跟着退出，我们将这个orDone channel也传递到了调用中。
				}
			}
		}()
		return orDone
	}
}
~~~

这是一个相当简洁的函数，使你可以将任意数量的channel组合到单个channel中，只要任何组件channel关闭或写入，该channel就会关闭。
下面是个简短的例子，它将经过一段时间后关闭的channel，并将这些channel合并到一个关闭的单个channel中：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	sig := func(after time.Duration) <-chan any {
		c := make(chan any)
		go func() {
			defer close(c)
			time.Sleep(after)
			c <- struct{}{}
		}()
		return c
	}

	start := time.Now()
	<-or(
		sig(2*time.Hour),
		sig(5*time.Minute),
		sig(1*time.Second),
		sig(1*time.Hour),
		sig(1*time.Minute),
	)
	fmt.Printf("done after %v\n", time.Since(start))
}
~~~

输出如下：`done after 1.0107002s`

请注意，尽管在我们的调用中放置了多个channel或需要不同时间才能关闭，但我们在1s后关闭的channel会导致由该调用创建的整个channel关闭。
这是因为尽管它位于树或函数构建的树中，它将始终关闭，因此依赖于其关闭的channel也将关闭。

我们以附加的goroutine为代价来实现这个简洁性，$f(x) = \left\lceil \frac{x}{2} \right\rceil$,其中x是goroutine的数量，但要记住Go语言的一个优点是能够快速创建，调度和运行goroutine,并且该语言积极鼓励使用goroutine来正确建模问题。
担心在这里创建的goroutine的数量可能是一个不成熟的优化。此外，如果在编译时你不知道你正在使用多少个“done channel”,则将会没有其他方式可以合并“done channel”

这种模式在你的系统中的模块交汇处非常有用。在这些交汇处，你的调用堆中应该有复数种的用来取消goroutine的决策树。
使用or函数，你可以简单地将它们组合在一起并将其传递给堆栈。
我们将在本章后面“context包”中看到另一种做法，这也很好，也许更具描述性。

### 错误处理

在并发程序中，错误处理可能难以正确进行。
有时候，我们花了很多时间思考我们的各种 stage 如何共享信息和进行协调，我们忘记考虑它们如何优雅地处理错误的状态。
**当G0语言避开了流行的错误异常模型时，它声明错误处理非常重要，并且在开发我们的程序时，我们应该给出我们的错误路径给予我们的算法同样的关注。**
本着这种精神，让我们来看看在处理多个并发进程时我们如何做到这一点。

思考错误处理时最根本的问题是，“谁应该负责处理错误？”在某些时候，程序需要停止将错误输出来，并且实际上对它做了些什么。这么做的目的是什么？

在并发进程中，这个问题变得更复杂一些。因为并发进程独立于其父进程或兄弟进程运行，所以它可能很难推断出错是正确的。
goroutine没有选择。它不能简单地吞下错误，因此它只能做出明智的事情：它会打印错误并希望某些内容被关注。
一般来说，你的并发进程应该把他们的错误发送到你的程序的另一部分，它有你的程序状态的完整信息，并可以做出更明智的决定做什么。
下面的例子，会在出现三个或更多错误时停止尝试检查状态：

~~~go
package main

import (
	"fmt"
	"net/http"
)

func main() {
	type Result struct {
		Response *http.Response
		Error    error
	}
	checkStatus := func(done <-chan any, urls ...string) <-chan Result {
		responses := make(chan Result)
		go func() {
			defer close(responses)
			for _, url := range urls {
				resp, err := http.Get(url)
				select {
				case <-done:
					return
				case responses <- Result{Response: resp, Error: err}:
				}
			}
		}()
		return responses
	}

	done := make(chan any)
	defer close(done)
	errCount := 0
	urls := []string{"a", "https://www.google.com", "b", "c", "d"}
	for result := range checkStatus(done, urls...) {
		if result.Error != nil {
			fmt.Printf("error: %v\n", result.Error)
			errCount++
			if errCount >= 3 {
				fmt.Println("Too many errors,breaking!")
				break
			}
			continue
		}
		fmt.Printf("Response:%v\n", result.Response.Status)
	}
}
~~~

输出如下：

~~~
error: Get "a": unsupported protocol scheme ""
Response:200 OK
error: Get "b": unsupported protocol scheme ""
error: Get "c": unsupported protocol scheme ""
Too many errors,breaking!
~~~

因为错误是从checkStatus返回的而不是在goroutine内部处理的，错误处理遵循熟悉的G0语言模式。
这是一个简单的例子，但不难想象，main goroutine正在协调多个goroutine的结果，并制定更复杂的规则来继续或取消子goroutine.。
此外，这里的主要内容是，在构建从goroutine返回值时，应将错误视为一等公民。
如果你的goroutine可能产生错误，那么这些错误应该与你的结果类型紧密结合，并且通过相同的通信线传递，就像常规的同步函数一样。

### pipeline

pipeline 是可以用来在系统中形成抽象的一种工具。
特别是，当你的程序需要流式处理或批处理数据时，它是一个非常强大的工具。
pipeline这个词据称是在1856年首次使用的，可能是指将液体从一个地方输送到另一个地方的一系列管道。
我们在计算机科学中借用了这个术语，因为我们也在从一个地方向另一个地方传输某些东西：数据。
pipeline只不过是一系列将数据输入，执行操作并将结果数据传回的系统。我们称这些操作都是pipeline的一个stage。

通过使用pipeline,你可以分离每个stage的关注点，这提供了许多好处。
你可以相互独立地修改各个stage,你可以混合搭配stage的组合方式，而无需修改stage,你可以将每个stage同时处理到上游或下游stage,并且可以扇出或限制部分你的pipeline。

让我们从简单的开始，尝试构建一个pipeline的stage。
如前所述，一个stage只是将数据输入，对其进行转换并将数据发回。下面是一个可以被视为pipeline stage的函数的例子：

~~~go
package main

import "fmt"

func main() {
	multiply := func(values []int, multiplier int) []int {
		multipliedValues := make([]int, len(values))
		for i, v := range values {
			multipliedValues[i] = v * multiplier
		}
		return multipliedValues
	}
	add := func(values []int, adder int) []int {
		addedValues := make([]int, len(values))
		for i, v := range values {
			addedValues[i] = v + adder
		}
		return addedValues
	}
	ints := []int{1, 2, 3, 4, 5}
	for _, v := range add(multiply(ints, 2), 1) {
		fmt.Println(v)
	}
}
~~~

输出如下：

~~~
3
5
7
9
11
~~~

看看我们如何在range子句中结合添加和乘法。这些函数就像你每天工作的函数一样，但是因为我们将它们构建为具有pipeline stage的属性，所以我们可以将它们组合起来形成一个pipeline。
那很有意思，pipeline stage的属性是什么？

* 一个stage消耗并返回相同的类型.
* 一个stage必须用语言来表达，以便它可以被传递。Go语言中的功能已被证实，并很好地适用于此目的。

事实上，pipeline stage与函数式编程密切相关，可以被认为是 monad 的一个子集。我不会在这里明确地讨论monad或函数式编程，但它们本身就是一个有趣的主题，并且在尝试理解pipeline时，对这两个主题的工作知识虽然不必要，但是有用。
在这里，我们的add和multiply stage满足pipeline stage的所有属性：它们都消耗一个int切片并返回一个int切片，并且因为Go语言具有函数化功能，所以我们可以传递add和multiply。
这些属性引起了我们前面提到的 pipeline stage 的有趣特性，即在不改变stage本身的情况下，将我们的 stage 结合到更高层次变得非常容易。

例如，如果我们现在想要为pipeline添加一个额外的stage来乘以2，我们只需将我们以前的pipeline包装在一个新的乘法stage,如下所示：

~~~
	ints := []int{1, 2, 3, 4, 5}
	for _, v := range multiply(add(multiply(ints, 2), 1), 2) {
		fmt.Println(v)
	}
~~~

最初，这看起来简单得多，但正如我们看到的那样，程序代码在处理数据流时不会提供与pipeline相同的好处。
请注意每个stage是如何获取切片数据并返回切片数据的？这些stage正在执行我们称作批处理的操作。这意味若它们仅对大块数据进行一次操作，而不是一次一个离散值。
还有另一种类型的pipeline stage执行流处理。这意味着这个stage一次只接收和处理一个元素。

批处理和流处理有优点和缺点，我们将稍微讨论一下。
现在，请注意，为使原始数据保持不变，每个stage都必须创建一个等长的新片段来存储其计算结果。
这意味着我们程序在任何时候的内存占用量都是我们发送到我们 pipeline 开始处的片大小的两倍。
让我们将我们的stage转换为以流为导向，看起来如下所示：

~~~go
package main

import "fmt"

func main() {
	multiply := func(value int, multiplier int) int {
		return value * multiplier
	}
	add := func(value int, adder int) int {
		return value + adder
	}
	ints := []int{1, 2, 3, 4, 5}
	for _, v := range ints {
		fmt.Println(add(multiply(v, 2), 1))
	}
}
~~~

每个stage都接收并发出一个离散值，我们的程序的内存占用空间将回落到只有pipeline输入的大小。
但是我们不得不将pipeline写入到for循环的体内，并让range语句为我们的pipeline进行繁重的提升。
这不仅限制了我们供应pipeline的重复使用，这也限制了我们的扩展能力。

还有其他问题。实际上，我们正在为循环的每次迭代实例化我们的pipeline。尽管进行函数调用代价很低，但我们为循环的每次迭代进行三次函数调用。
并发性又如何？我前面说过，使用pipeline的好处之一是能够同时处理各个stage,并且我提到了一些关于扇出(fan-out)的内容。所有进来的地方在哪里？

#### 构建 pipeline 的最佳实践

channel非常适合在Go语言中构建pipeline,因为它们满足了我们所有的基本要求。
它们可以接受和产生值，可以安全地同时使用，还可以被放弃，它们被语言所证实。
让我们花点时间转换一下前面的例子来改用channel:

~~~go
package main

func main() {
	generator := func(done <-chan any, integers ...int) <-chan int {
		intStream := make(chan int)
		go func() {
			defer close(intStream)
			for _, i := range integers {
				select {
				case <-done:
					return
				case intStream <- i:
				}
			}
		}()
		return intStream
	}
	multiply := func(done <-chan any, intStream <-chan int, multiplier int) <-chan int {
		multipliedStream := make(chan int)
		go func() {
			defer close(multipliedStream)
			for i := range intStream {
				select {
				case <-done:
					return
				case multipliedStream <- i * multiplier:
				}
			}
		}()
		return multipliedStream
	}
	add := func(done <-chan any, intStream <-chan int, additive int) <-chan int {
		summedStream := make(chan int)
		go func() {
			defer close(summedStream)
			for i := range intStream {
				select {
				case <-done:
					return
				case summedStream <- i + additive:
				}
			}
		}()
		return summedStream
	}
	done := make(chan any)
	defer close(done)
	intStream := generator(done, 1, 2, 3, 4)
	pipeline := multiply(done, add(done, intStream, 1), 2)
	for v := range pipeline {
		println(v)
	}
}
~~~

输出如下：

~~~
4
6
8
10
~~~

我们得到了期望的输出。它们都看起来像是在他们的函数体内开始了一个goroutine，通过一个channel表示该goroutine应该退出。这里使用了我们前面“防止goroutine泄漏”中建立的模式。
它们看起来都像是返回channel,其中一些看起来像是在另外一个channel中。

generator 函数接受一个可变的整数切片，构造一个缓存长度等于输入整数片段的整数channel,启动一个goroutine并返回构造的channel。
然后，在创建的goroutine上，generator函数使用range语句遍历传入的可变切片，并在其创建的channel上发送切片的值。
请注意，channel上的发送与完成channel上的选择共享一条select语句。再一次，使用了前面“防止goroutine泄漏”中建立的模式，以防止泄漏goroutines。

简而言之，**generator函数将一组离散值转换为一个channel上的数据流**。适当地说，这种类型的功能称为生成器。
在使用流水线时，你会经常看到这一点，因为在流水线开始时，你总是会有一些需要转换为channel的数据。

这里的channel与前面例子中使用函数的channel有些不同之处。
首先，我们正在使用pipeline。这是显而易见的，因为它允许两件事情：在我们的pipeline的末尾，我们可以使用范围语句来提取值，并且在每个stage我们可以安全地同时执行，因为我们的输入和输出在并发上下文中是安全的。
这给我们带来了第二个不同之处：pipeline的每个stage都在执行控制。这意味着任何stage只需要等待其输入，并且能够发送其输出。事实证明，这会产生巨大的影响。可以注意到它允许我们的stage相互独立地执行某个片段时间。

> pipeline中，每个stage都会接收done channel。即`case <-done: return`控制语句。任何时候关闭 done channel，所有 stage 都会立即终止。
> 同时每个 stage 都会在退出前关闭自己管理的 channel `defer close(stream)`，避免 goroutine 泄漏。
> 最后每个 stage 的抢占性依赖于上游 stage 的抢占性 `for i := range stream`，最终形成一个递归关系。
>
> 很妙。书中的描述我没看懂，但就是环环相扣保证我们可以随时终止整个pipeline，而不会导致资源泄漏或阻塞。

#### 一些便利的生成器

pipeline的生成器是将一组离散值转换为channel上的值流的任何函数。

我们来看看一个名为 repeat 的生成器：

~~~go
package main

import "fmt"

func main() {
	repeat := func(done <-chan any, values ...any) <-chan any {
		valueStream := make(chan interface{})
		go func() {
			defer close(valueStream)
			for {
				for _, v := range values {
					select {
					case <-done:
						return
					case valueStream <- v:
					}
				}
			}
		}()
		return valueStream
	}
	take := func(done <-chan any, valueStream <-chan any, num int) <-chan any {
		takeStream := make(chan any)
		go func() {
			defer close(takeStream)
			for i := 0; i < num; i++ {
				select {
				case <-done:
					return
				case takeStream <- <-valueStream:
				}
			}
		}()
		return takeStream
	}
	done := make(chan any)
	defer close(done)
	for v := range take(done, repeat(done, 1), 10) {
		fmt.Printf("%v ", v)
	}
}
~~~

输出如下：`1 1 1 1 1 1 1 1 1 1 `

这段代码展示了 Go 语言中 **pipeline** 模式的另一种实现方式，结合了 `repeat` 和 `take` 两个 stage，用于生成重复的值并从中取出指定数量的值。下面我们逐步分析代码的功能和运行机制。

1. **`repeat` 函数**：生成一个无限重复的流，将传入的值循环发送到 channel 中。
2. **`take` 函数**：从传入的 channel 中取出指定数量的值，然后关闭 channel。
3. **`main` 函数**：组合 `repeat` 和 `take`，生成一个重复的值流，并从中取出前 10 个值。

我们可以扩展这一点。让我们创建另一个重复的生成器，但是这次我们创建一个重复调用函数的生成器。我们称之为repeatFn:

~~~go
package main

import (
	"fmt"
	"math/rand/v2"
)

func main() {
	repeatFn := func(done <-chan any, fn func() any) <-chan any {
		valueStream := make(chan any)
		go func() {
			defer close(valueStream)
			for {
				select {
				case <-done:
					return
				case valueStream <- fn():
				}
			}
		}()
		return valueStream
	}
	take := func(done <-chan any, valueStream <-chan any, num int) <-chan any {
		takeStream := make(chan any)
		go func() {
			defer close(takeStream)
			for i := 0; i < num; i++ {
				select {
				case <-done:
					return
				case takeStream <- <-valueStream:
				}
			}
		}()
		return takeStream
	}
	done := make(chan any)
	defer close(done)
	rand := func() any {
		return rand.Int()
	}
	for v := range take(done, repeatFn(done, rand), 10) {
		fmt.Println(v)
	}
}
~~~

这非常酷，一个根据需要生成随机整数的无限channel（确实，从未有过的想法

一般来说，pipeline上的限制因素将是你的生成器，或者是计算密集型的一个stage。如果生成器不像repeat和repeatFn生成器那样从内存中创建流，则可能会受/O限制。
如果一个stage计算成本很高，我们该如何帮助缓解这个问题呢？它不会限制整个pipeline的速度吗？
为了缓解这种情况，让我们来讨论扇出扇入(fan-out,fan-in)技术。

### 扇入、扇出

**扇入（Fan-In）** 和 **扇出（Fan-Out）** 是并发编程中的两种常见模式，用于描述数据流的合并和分发。它们在处理多任务、多数据源或多消费者场景时非常有用。

扇出是指将 **一个输入流分发给多个处理单元（goroutine）**，以实现并行处理。扇出模式通常用于提高任务的处理效率。
在某个stage在计算上特别昂贵时，可以使用扇出，增加处理单元来提高效率。防止上游阻塞。

扇入是指将 **多个输入流合并为一个输出流**。扇入模式通常用于将多个 goroutine 的结果汇总。

扇入和扇出通常结合使用，以实现高效的并发处理。
例如下面的代码，首先创建一个无限的随机数生成器，并使用多个stage计算其是否为素数（耗时操作），然后使用fanIn将计算结果进行合并，最后take取出前10个结果：

~~~go
package main

import (
	"fmt"
	"math/rand"
	"runtime"
	"sync"
	"time"
)

func main() {
	repeatFn := func(done <-chan any, fn func() any) <-chan any {
		valueStream := make(chan any)
		go func() {
			defer close(valueStream)
			for {
				select {
				case <-done:
					return
				case valueStream <- fn():
				}
			}
		}()
		return valueStream
	}
	take := func(done <-chan any, valueStream <-chan any, num int) <-chan any {
		takeStream := make(chan any)
		go func() {
			defer close(takeStream)
			for i := 0; i < num; i++ {
				select {
				case <-done:
					return
				case takeStream <- <-valueStream:
				}
			}
		}()
		return takeStream
	}
	toInt := func(done <-chan any, valueStream <-chan any) <-chan int {
		intStream := make(chan int)
		go func() {
			defer close(intStream)
			for v := range valueStream {
				select {
				case <-done:
					return
				case intStream <- v.(int):
				}
			}
		}()
		return intStream
	}
	primeFinder := func(done <-chan any, intStream <-chan int) <-chan any {
		primeStream := make(chan any)
		go func() {
			defer close(primeStream)
			for integer := range intStream {
				integer -= 1
				prime := true
				for divisor := integer - 1; divisor > 1; divisor-- {
					if integer%divisor == 0 {
						prime = false
						break
					}
				}

				if prime {
					select {
					case <-done:
						return
					case primeStream <- integer:
					}
				}
			}
		}()
		return primeStream
	}
	fanIn := func(done <-chan any, channels ...<-chan any) <-chan any {
		var wg sync.WaitGroup
		multiplexedStream := make(chan any)

		multiplex := func(c <-chan any) {
			defer wg.Done()
			for i := range c {
				select {
				case <-done:
					return
				case multiplexedStream <- i:
				}
			}
		}

		// Select from all the channels
		wg.Add(len(channels))
		for _, c := range channels {
			go multiplex(c)
		}

		// Wait for all the reads to complete
		go func() {
			wg.Wait()
			close(multiplexedStream)
		}()

		return multiplexedStream
	}

	done := make(chan any)
	defer close(done)

	start := time.Now()

	rand := func() any { return rand.Intn(50000000) }
	randIntStream := toInt(done, repeatFn(done, rand))
	numFinders := runtime.NumCPU()
	fmt.Printf("Spinning up %d prime finders.\n", numFinders)
	finders := make([]<-chan any, numFinders)
	fmt.Println("Primes:")
	for i := 0; i < numFinders; i++ {
		finders[i] = primeFinder(done, randIntStream)
	}
	for prime := range take(done, fanIn(done, finders...), 10) {
		fmt.Printf("\t%d\n", prime)
	}

	fmt.Printf("Search took: %v", time.Since(start))
}
~~~

输出如下：

~~~
Spinning up 20 prime finders.
Primes:
	8768423
	31296637
	37026001
	11348221
	32732303
	1481477
	46401169
	49287157
	10097783
	27371681
Search took: 488.1048ms
~~~

| **模式** | **描述**                   | **应用场景**  |
|--------|--------------------------|-----------|
| 扇出     | 将输入流分发给多个处理单元（goroutine） | 并行处理任务    |
| 扇入     | 将多个输入流合并为一个输出流           | 汇总多个任务的结果 |

扇入和扇出是并发编程中非常强大的工具，能够有效提高程序的性能和可扩展性。
感觉有些类似大数据处理中的 map 和 reduce

### or-done-channel

有时候，你需要处理来自系统各个分散部分的channel。与pipeline所不同的是，你不能对一个被done channel所取消的channel将会进行什么行为做任何的断言。
也就是说，你不知道你的goroutine是否被取消，这意味着你正在读取的channel将被取消。
出于这个原因，正如在本章前面“防止goroutine泄漏”中所阐述的那样，**我们需要用channel中的select语句来包装我们的读操作，并从已完成的channel中进行选择。**
会写出这样的封 `orDone`：

~~~go
package main

import (
	"fmt"
	"math/rand"
)

func main() {
	orDone := func(done, c <-chan any) <-chan any {
		valStream := make(chan any)
		go func() {
			defer close(valStream)
			for {
				select {
				case <-done:
					return
				case v, ok := <-c:
					if ok == false {
						return
					}
					select {
					case valStream <- v:
					case <-done:
					}
				}
			}
		}()
		return valStream
	}
	repeatFn := func(done <-chan any, fn func() any) <-chan any {
		valueStream := make(chan any)
		go func() {
			defer close(valueStream)
			for {
				select {
				case <-done:
					return
				case valueStream <- fn():
				}
			}
		}()
		return valueStream
	}
	take := func(done <-chan any, valueStream <-chan any, num int) <-chan any {
		takeStream := make(chan any)
		go func() {
			defer close(takeStream)
			for i := 0; i < num; i++ {
				select {
				case <-done:
					return
				case takeStream <- <-valueStream:
				}
			}
		}()
		return takeStream
	}
	done := make(chan any)
	stream := take(done, repeatFn(done, func() any { return rand.Int() }), 10)
	for val := range orDone(done, stream) {
		fmt.Println(val)
	}
}
~~~

### tee-channel

有时候你可能想分制一个来自channel的值，以便将它们发送到你的代码的两个独立区域中。
设想一下，一个传递用户指令的channel:你可能想要在一个 channel 上接收一系列用户指令，将它们发送给相应的执行器，并将它们发送给记录命令以供日后审计的东西。

从类UNIX系统中的 tee 命令中获得它的名字，tee-channel 就是这样做的。
你可以将它传递给一个读channel,并且它会返回两个单独的channel,以获得相同的值：

~~~go
package main

import (
	"fmt"
)

func main() {
	repeat := func(done <-chan interface{}, values ...interface{}) <-chan interface{} {
		valueStream := make(chan interface{})
		go func() {
			defer close(valueStream)
			for {
				for _, v := range values {
					select {
					case <-done:
						return
					case valueStream <- v:
					}
				}
			}
		}()
		return valueStream
	}
	take := func(done <-chan interface{}, valueStream <-chan interface{}, num int) <-chan interface{} {
		takeStream := make(chan interface{})
		go func() {
			defer close(takeStream)
			for i := 0; i < num; i++ {
				select {
				case <-done:
					return
				case takeStream <- <-valueStream:
				}
			}
		}()
		return takeStream
	}
	orDone := func(done, c <-chan interface{}) <-chan interface{} {
		valStream := make(chan interface{})
		go func() {
			defer close(valStream)
			for {
				select {
				case <-done:
					return
				case v, ok := <-c:
					if ok == false {
						return
					}
					select {
					case valStream <- v:
					case <-done:
					}
				}
			}
		}()
		return valStream
	}
	tee := func(done <-chan interface{}, in <-chan interface{}) (_, _ <-chan interface{}) {
		out1 := make(chan interface{})
		out2 := make(chan interface{})
		go func() {
			defer close(out1)
			defer close(out2)
			for val := range orDone(done, in) {
				var out1, out2 = out1, out2 // 使用out1和out2的本地版本。
				for i := 0; i < 2; i++ {
					// 使用se1ect语句，以便不阻塞的写入out1和out2。为确保两者都写入，将执行select语句的两次迭代：每个出站一个channel。
					select {
					case <-done:
					case out1 <- val:
						out1 = nil // 一旦写入了channel,将其影副本设置为nil,以便进一步阻塞写入，而另一个channel可以继续。
					case out2 <- val:
						out2 = nil // 一旦写入了channel,将其影副本设置为nil,以便进一步阻塞写入，而另一个channel可以继续。
					}
				}
			}
		}()
		return out1, out2
	}
	done := make(chan interface{})
	defer close(done)

	out1, out2 := tee(done, take(done, repeat(done, 1, 2), 4))

	for val1 := range out1 {
		fmt.Printf("out1: %v, out2: %v\n", val1, <-out2)
	}
}
~~~

输出如下：

~~~
out1: 1, out2: 1
out1: 2, out2: 2
out1: 1, out2: 1
out1: 2, out2: 2
~~~

注意写入out1和out2是紧密耦合的。直到out1和0ut2都被写入，迭代才能继续。
防止出现out1和out2的消费者消费速度不一致，导致数据顺序的问题（适合数据严格同步的场景）。同时，如果消费者没有及时消费，写入操作会阻塞。
最后，这个模式也可以作为多个goroutine的同步点。

### 桥接 channel 模式

在某些情况下，你可能会发现自己希望从一系列的channel中消费产生的值：`<-chan <-chan any`
这与将channel切片合并到单个channel中稍有不同，如我们在本章前面“The or-channel”或“扇出，扇入”中所看到的。
一系列的channel需要有序地写入，即使是不同的来源。

~~~go
package main

import (
	"fmt"
)

func main() {
	orDone := func(done, c <-chan any) <-chan any {
		valStream := make(chan any)
		go func() {
			defer close(valStream)
			for {
				select {
				case <-done:
					return
				case v, ok := <-c:
					if ok == false {
						return
					}
					select {
					case valStream <- v:
					case <-done:
					}
				}
			}
		}()
		return valStream
	}
	bridge := func(done <-chan any, chanStream <-chan <-chan any) <-chan any {
		valStream := make(chan any) // 这将返回  bridge 中的所有值的 channel
		go func() {
			defer close(valStream)
			// 循环从 chanStream 中获取每个 channel，并提供给嵌套循环来使用
			for {
				var stream <-chan any
				select {
				case maybeStream, ok := <-chanStream:
					if ok == false {
						return
					}
					stream = maybeStream
				case <-done:
					return
				}
				// 循环读取已给出的 channel 中的值，将其写入 valStream。当正在循环的流关闭时，将从此流中跳出，继续下一次迭代
				for val := range orDone(done, stream) {
					select {
					case valStream <- val:
					case <-done:
					}
				}
			}
		}()
		return valStream
	}
	genVals := func() <-chan <-chan any {
		chanStream := make(chan (<-chan any))
		go func() {
			defer close(chanStream)
			for i := 0; i < 10; i++ {
				stream := make(chan any, 1)
				stream <- i
				close(stream)
				chanStream <- stream
			}
		}()
		return chanStream
	}

	for v := range bridge(nil, genVals()) {
		fmt.Printf("%v ", v)
	}
}
~~~

输出如下：`0 1 2 3 4 5 6 7 8 9 `

通过桥接，可以在单个 range 中使用处理 channel 的 channel，并专注于循环逻辑。将结构处理的部分放在 bridge 函数中。

### 队列排队

有时，在你的队列尚未准备好的时候就开始接受请求是很有用的。这个过程被称作队列。

这也就意味若只要你的stage完成了某些工作，它就会把结果存储在一个稍后其他stage可以获取到结果的临时存储位置，而且你的stage不需要保存一份指向结果的引用。
在第3章“channel”中，我们讨论了带缓存的channel,那其实就是一种队列，而且我们当时有足够的理由不去过多讨论使用它。

虽然在系统中引入队列功能非常有用，但它通常是优化程序时希望采用的最后一种技术之一。
预先添加队列可以隐藏同步问题，例如死锁和活锁，并且，随着程序向正确性收敛，你可能会发现需要更多或更少的队列。

那么队列有什么好处呢？让我们开始回答这个问题，通过解决人们在调整系统性能时犯的一个常见错误：引入队列来尝试解决性能问题。**队列几乎不会加速程序的总运行时间，它只会让程序的行为有所不同。**
**对于引入队列的效用问题的答案并不是一个stage的运行时间已经减少，而是它处于阻塞状态的时间减少了。这可以让这个stage继续工作。**

比如在web服务中的用户请求。加入队列之后用户可能会在他们的请求中经历滞后，但他们不会被拒绝服务。
通过这种方式，队列的真正用途是将stage分离，以便一个stage的运行时间不会影响另一个stage的运行时间。
以这种方式解耦stage,然后级联以改变整个系统的运行时行为，这取决于你的系统，可以是好的也可以是不好的。

然后我们来讨论调整排队问题。队列应该放在哪里？缓冲区大小应该是多少？这些问题的答案取决于你的管道的性质。
首先分析排队可以提高系统整体性能的情况。唯一适用的情况是：

* 如果在一个stage批处理请求节省时间。
* 如果stage中的延迟产生反馈回路（如重试、超时等）进入系统。

第一种情况的一个例子是将输入缓冲到比被设计为发送给（例如，盘）更快的事物（例如，存储器）的stage。

很显然，这就是Go语言的 bufio 包的目的。
缓冲写入比未缓冲写入更快。这是因为在 bufio.Writer 中，写入在内部排队到缓冲区中，直到已经积累了足够的块为止，然后块被写出。这个过程通常称为分块，原因很明显。
分块速度更快，因为 bytes.Buffer 必须增加其分配的内存以容纳它必须存储的字节。出于各种原因，增长的内存消耗是昂贵的。所以，我们需要增长的时间越少，整个系统的整体效率就越高。因此，排队提高了整个系统的性能。

这只是一个简单的内存分块示例，但是你可能会在该领域频繁地进行分块。
通常，任何时候执行操作都需要开销，分块可能会提高系统性能。这方面的一些例子是打开数据库事务，计算消息校验和以及分配连续空间。
除了分块之外，如果你的算法可以通过支持向后看或排序进行优化，排队也可以起到帮助作用。

第二种情况是，一个stage的延迟导致管道中接收到了更多的输入，这更难以发现，但也更重要，因为它可能导致上游系统的崩遗。

这个想法通常被称为负反馈循环，向下螺旋，甚至是死亡螺旋。
这是因为管道与上游系统之间存在经常性关系，上游stage或系统提交新请求的速度在某种程度上与管道的有效性有关。
如果管道的效率降低到某个临界阈值以下，管道上游的系统开始增加它们对管道的输入（比如重试操作），这导致管道损失更多效率，并且死亡螺旋开始。
如果没有某种安全防护，使用管道的系统将永远不能恢复。通过在管道入口处引入队列，你可以用创建请求滞后为代价来打破反馈循环。
从调用者进入管道的角度来看，请求似乎正在处理中，但需要很长时间。只要调用者不超时，你的管道将保持稳定。
如果主叫方超时，则需要确保你在出列时支持某种检查准备情况。如果你不这样做，你可能会无意中通过处理死亡请求来创建反馈循环，从而降低管道的效率。

在“队列”理论中，有这样的一条法则，通过足够的取样，可以预测管道的需求率。这被称作[利特尔法则](https://zh.wikipedia.org/wiki/%E5%88%A9%E7%89%B9%E7%88%BE%E6%B3%95%E5%89%87)。
`L = λ × W (系统中的平均负载数=负载的平均到达率*负载在系统中花费的平均时间)`
这个等式只可以应用在所谓的稳定的系统。在管道中，一个稳定的系统是指工作负载进入管道，或者说入口的速率与负载退出系统的速率相等。
如果入口的速率超过了出口的速率，你的系统就是不稳定的，而且已经进入了一个死循环。
如果你的入口速率没有超过出口速率，你仍旧造成了一个不稳定的系统，但这所导致的也仅仅是你的系统资源并没有被完全使用而已。那并不是这个世界上最槽糕的情况，但是，你可能会在大规模系统（例如，集群或者数据中心）中关心这个问题。

具体的计算这里省略。
总之，队列在系统中可能会很有用，但由于它的复杂性（它会隐藏问题），建议作为实现的最后一个优化手段。

### context 包

在并发程序中，由于超时，取消或系统其他部分的故障往往需要抢占操作。
我们已经看过了创建done channel的习惯用法，该 channel 在你的程序中流动并取消所有阻塞的并发操作。这很好，但它也是有限的。

如果我们可以在简单的通知上附加传递额外的信息以取消：为什么取消发生，或者我们的函数是否有需要完成的最后期限（超时），这将非常有用。
事实证明，对于任何规模的系统来说，使用这些信息来包装已完成的频道是非常常见的，因此Go语言的作者们决定为此创建一个标准模式。
它起源于一个在标准库之外的实验功能，但是在Go1.7中，context包被引人标准库中，这使得它成为考虑并发问题时的一个标准的风格。
如果看一下上下文包，我们看到它非常简单：

~~~go
var Canceled = errors.New("context canceled")
var DeadlineExceeded error = deadlineExceededError{}

type CancelFunc
type Context

func Background() Context
func TODO() Context
func WithCancel(parent Context) (ctx Context, cancel CancelFunc)
func WithDeadline(parent Context, deadline time.Time) (Context, CancelFunc)
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)
func Withvalue(parent Context, key, val interface{})
~~~

~~~
type Context interface {
    // 当为该 context 工作的 work 被取消时，deadline 会返回时间。
    // 在没有设定期限的情况下，会返回 ok==false
    // 连续调用 deadline 会返回相同的值
    Deadline() (deadline time.Time, ok bool)
    
    // Done 返回一个 channel，当代表此 context 的工作应被取消时，该 channel 会被关闭。
    // 如果此 context 永远无法被取消，Done 可能返回 nil。
    // 对 Done 的多次调用会返回相同的值。
    // Done channel 的关闭可能是异步的，甚至在 cancel 函数返回之后才发生。
    //
    // WithCancel 会在 cancel 被调用时安排 Done channel 的关闭；
    // WithDeadline 会在截止时间到达时安排 Done channel 的关闭；
    // WithTimeout 会在超时时间到达时安排 Done channel 的关闭。
    //
    // Done 的设计目的是用于 select 语句中。
    Done() <-chan struct{}
    
    // 如果 Done 尚未关闭，Err 返回 nil。
    // 如果 Done 已关闭，Err 返回一个非 nil 的错误，解释原因：
    // - 如果 context 被取消，返回 Canceled 错误；
    // - 如果 context 的截止时间已过，返回 DeadlineExceeded 错误。
    // 一旦 Err 返回一个非 nil 的错误，后续对 Err 的调用将返回相同的错误。
    Err() error
    
    // Value 返回与当前 context 中 key 关联的值，如果没有值与 key 关联，则返回 nil。
    // 对 Value 的多次调用（使用相同的 key）会返回相同的结果。
    //
    // 仅将 context 的值用于跨进程和 API 边界的请求范围数据传递，
    // 而不是将可选参数传递给函数。
    Value(key any) any
}
~~~

上下文包有两个主要目的：

* 提供一个可以取消你的调用图中分支的API。
* 提供用于通过呼叫传输请求范围数据的数据包。

让我们关注第一个方面：取消。
正如我们在本章前面“防止goroutine泄漏”中所学到的，函数中的取消有三个方面：

* goroutine的父goroutine可能想要取消它。
* 一个goroutine可能想要取消它的子goroutine。
* goroutine中的任何阻塞操作都必须是可抢占的，以便它可以被取消。

context包帮助管理所有这三个东西。
正如我们所提到的，context类型将是你的函数的第一个参数。如果你看看context接口上的方法，你会发现没有任何东西可以改变底层结构的状态。
此外，接收context的函数并不能取消它。这保护了调用堆栈上的函数被子函数取消上下文的情况。
结合done channel提供的完成函数，运行上下文类型安全的管理其子上下文的取消。

下面的函数都接收一个 Context 参数，并返回一个 Context。其中还有些其他参数，比如截止时间和超时参数。
这些函数用来生成新的 Context 实例（父子上下文）。

~~~go
func WithCancel(parent Context) (ctx Context, cancel CancelFunc)
func WithCancelCause(parent Context) (ctx Context, cancel CancelCauseFunc)
func WithDeadline(parent Context, d time.Time) (Context, CancelFunc)
func WithDeadlineCause(parent Context, d time.Time) (Context, CancelFunc)
func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)
func WithTimeoutCause(parent Context, timeout time.Duration) (Context, CancelFunc)
func WithValue(parent Context, key, val any) Context
func WithoutCancel(parent Context) Context
~~~

WithCancel返回一个新的Context,它在调用返回的cancel函数时关闭其done channel。
WithDeadline返回一个新的Context,当机器的时钟超过给定的最后期限时，它关闭完成的channel。
WithTimeout返回一个新的Context,它在给定的超时时间后关闭其完成的channel。

如果你的函数需要以某种方式在调用图中取消它后面的函数，它将调用其中一个函数并传递给它的上下文，然后将返回的上下文传递给它的子元素。
如果你的函数不需要修改取消行为，那么函数只传递给定的上下文。
通过这种方式，调用图的连续图层可以创建符合其需求的上下文，而不会影响其父母节点。
这为如何管理调用图的分支提供了一个非常可组合的优雅解决方案。

context包就是本着这种精神来串联起你程序的调用图的。
在面向对象的范例中，通常将对经常使用的数据的引用存储为成员变量，但重要的是不要使用context.Context的实例来执行此操作。
context.Context的实例可能与外部看起来相同，但在内部它们可能会在每个栈帧更改。
出于这个原因，总是将context的实例传递给你的函数是很重要的。通过这种方式，函数具有用于它的上下文，而不是用于堆栈N的上下文。
在异步调用图的顶部，你的代码可能不会传递上下文。要启动链，上下文包提供了两个函数来创建上下文的空实例：

~~~
func Background()Context
func TODO()Context
~~~

`Background()`只是返回一个空的上下文。`TODO()`不是用于生产，而是返回一个空的上下文。
`TODO()`的预期目的是作为一个占位符，当你不知道使用哪个上下文，或者你希望你的代码被提供一个上下文，但上游代码还没有提供。

来看一个使用完成channel模式的例子，并且看看我们可以从切换到使用context包获得什么好处。
这是一个同时打印问候和告别的程序：

~~~go
package main

import (
	"fmt"
	"sync"
	"time"
)

func main() {
	var wg sync.WaitGroup
	done := make(chan any)
	defer close(done)

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := printGreeting(done); err != nil {
			fmt.Printf("%v", err)
			return
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := printFarewell(done); err != nil {
			fmt.Printf("%v", err)
			return
		}
	}()

	wg.Wait()
}

func printGreeting(done <-chan any) error {
	greeting, err := genGreeting(done)
	if err != nil {
		return err
	}
	fmt.Printf("%s world!\n", greeting)
	return nil
}

func printFarewell(done <-chan any) error {
	farewell, err := genFarewell(done)
	if err != nil {
		return err
	}
	fmt.Printf("%s world!\n", farewell)
	return nil
}

func genGreeting(done <-chan any) (string, error) {
	switch locale, err := locale(done); {
	case err != nil:
		return "", err
	case locale == "EN/US":
		return "hello", nil
	}
	return "", fmt.Errorf("unsupported locale")
}

func genFarewell(done <-chan any) (string, error) {
	switch locale, err := locale(done); {
	case err != nil:
		return "", err
	case locale == "EN/US":
		return "goodbye", nil
	}
	return "", fmt.Errorf("unsupported locale")
}

func locale(done <-chan any) (string, error) {
	select {
	case <-done:
		return "", fmt.Errorf("canceled")
	case <-time.After(1 * time.Minute):
	}
	return "EN/US", nil
}
~~~

输出如下：

~~~
goodbye world!
hello world!
~~~

忽略竞争条件（我们可以在收到问好之前接收到我们的告别！），我们可以看到我们的程序有两个分支同时运行。
我们通过创建完成通道并将其传递给我们的调用图来设置标准抢占方法。如果我们在main的任何一点关闭完成的频道，那么两个分支都将被取消。
通过引入goroutine,我们已经开辟了以几种不同且有趣的方式来控制该程序的可能性。

在每个堆栈框架中，一个函数可以影响其下的整个调用堆栈。
使用done channel模式，我们可以通过将传入的done channel包装到其他done channel中，然后在其中任何一个通道启动时返回，
但我们不会获得关于Context给我们的最后期限和错误的额外信息。
下面是使用context包实现的（设置 genGreeting 在放弃调用 locale 之前等待1s，超时时间为1s。并且如果 genGreeting 不成功，也会取消 printFarewall 的调用）：

~~~go
package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

func main() {
	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := printGreeting(ctx); err != nil {
			fmt.Printf("cannot print greeting: %v\n", err)
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := printFarewell(ctx); err != nil {
			fmt.Printf("cannot print farewell: %v\n", err)
		}
	}()

	wg.Wait()
}

func printGreeting(ctx context.Context) error {
	greeting, err := genGreeting(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("%s world!\n", greeting)
	return nil
}

func printFarewell(ctx context.Context) error {
	farewell, err := genFarewell(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("%s world!\n", farewell)
	return nil
}

func genGreeting(ctx context.Context) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()

	switch locale, err := locale(ctx); {
	case err != nil:
		return "", err
	case locale == "EN/US":
		return "hello", nil
	}
	return "", fmt.Errorf("unsupported locale")
}

func genFarewell(ctx context.Context) (string, error) {
	switch locale, err := locale(ctx); {
	case err != nil:
		return "", err
	case locale == "EN/US":
		return "goodbye", nil
	}
	return "", fmt.Errorf("unsupported locale")
}

func locale(ctx context.Context) (string, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(1 * time.Minute):
	}
	return "EN/US", nil
}
~~~ 

输出结果：

~~~
cannot print greeting: context deadline exceeded
cannot print farewell: context canceled
~~~

genGreeting构建自定义的Context.Context以满足其需求，而不必影响父级的context。
如果genGreeting成功返回，并且printGreeting需要再次调用，则可以在不泄漏有关genGreeting如何操作的信息的情况下进行。
这种可组合性使你能够编写大型系统，而无需在整个调用图中混淆问题。

我们可以对这个程序进行另一个改进：因为我们知道loca1e需要大约一分钟的时间来运行，所以我们可以检查是否给了我们最后期限，如果是的话，我们是否会遇到它。
即使用context.Context的Deadline方法（在locale上增加截止时间的判断）：

~~~go
package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

func main() {
	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := printGreeting(ctx); err != nil {
			fmt.Printf("cannot print greeting: %v\n", err)
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := printFarewell(ctx); err != nil {
			fmt.Printf("cannot print farewell: %v\n", err)
		}
	}()

	wg.Wait()
}

func printGreeting(ctx context.Context) error {
	greeting, err := genGreeting(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("%s world!\n", greeting)
	return nil
}

func printFarewell(ctx context.Context) error {
	farewell, err := genFarewell(ctx)
	if err != nil {
		return err
	}
	fmt.Printf("%s world!\n", farewell)
	return nil
}

func genGreeting(ctx context.Context) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()

	switch locale, err := locale(ctx); {
	case err != nil:
		return "", err
	case locale == "EN/US":
		return "hello", nil
	}
	return "", fmt.Errorf("unsupported locale")
}

func genFarewell(ctx context.Context) (string, error) {
	switch locale, err := locale(ctx); {
	case err != nil:
		return "", err
	case locale == "EN/US":
		return "goodbye", nil
	}
	return "", fmt.Errorf("unsupported locale")
}

func locale(ctx context.Context) (string, error) {
	if deadline, ok := ctx.Deadline(); ok {
		if time.Now().Add(1 * time.Minute).After(deadline) {
			return "", context.DeadlineExceeded
		}
	}
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(1 * time.Minute):
	}
	return "EN/US", nil
}
~~~

虽然这个更改差异很小，但它允许 locale 函数快速失败。在调用成本很高的程序中，可能会节省大量资源和时间，它允许立即失败，而不必等待实际的超时发生。
但现实中实践起来非常困难，因为必须要知道下级调用需要多长时间。

最后来介绍用于存储和检索请求范围数据的Context的数据包。
请记住，当一个函数创建一个goroutine和Context时，它通常会启动一个将为请求提供服务的goroutine,并且进一步向下的函数可能需要有关请求的信息。
以下是如何在上下文中存储数据以及如何检索数据的示例：

~~~go
package main

import (
	"context"
	"fmt"
)

func main() {
	ProcessRequest("jane", "abc123")
}
func ProcessRequest(userID, authToken string) {
	ctx := context.WithValue(context.Background(), "userID", userID)
	ctx = context.WithValue(ctx, "authToken", authToken)
	HandleResponse(ctx)
}
func HandleResponse(ctx context.Context) {
	fmt.Printf(
		"handling response for %v (%v)",
		ctx.Value("userID"),
		ctx.Value("authToken"),
	)
}
~~~

输出如下：`handling response for jane (abc123)`

很简单的东西。唯一的限制条件是：

* 键值必须满足Go语言的可比性概念，也就是运算符`==`和`!=`在使用时需要返回正确的结果。
* 返回值必须安全，才能从多个goroutine访问。

**由于Context的键和值都被定义为`interface{}`,所以当试图检索值时，我们会失去Go语言的类型安全性。**
key可以是不同的类型，或者与我们提供的key略有不同。值可能与我们预期的不同。
出于这些原因，Go语言作者建议你在从Context中存储和检索值时遵循一些规则。
首先，他们建议你**在软件包中定义一个自定义键类型。只要其他软件包执行相同的操作，则可以防止上下文中的冲突。**
作为一个提醒，为什么让我们看看一个简短的程序，试图将键存储在具有不同类型的映射中，但具有相同的基础值：

~~~go
package main

import "fmt"

type foo int
type bar int

func main() {
	m := make(map[any]int)
	m[foo(1)] = 1
	m[bar(1)] = 2
	fmt.Printf("%v", m)
}
~~~

输出如下：`map[1:2 1:1]`

虽然基础值是相同的，但不同的类型信息在map中区分它们。

同时由于我们不应该导出存储数据的key，所以必须导出检索数据的函数。允许这些数据使用者使用静态的、类型安全的函数。
最佳实践：

~~~go
package main

import (
	"context"
	"fmt"
)

func main() {
	ProcessRequest("jane", "abc123")
}

type ctxKey int

const (
	ctxUserId ctxKey = iota
	ctxAuthToken
)

func UserId(c context.Context) string {
	return c.Value(ctxUserId).(string)
}
func AuthToken(c context.Context) string {
	return c.Value(ctxAuthToken).(string)
}

func ProcessRequest(userID, authToken string) {
	ctx := context.WithValue(context.Background(), ctxUserId, userID)
	ctx = context.WithValue(ctx, ctxAuthToken, authToken)
	HandleResponse(ctx)
}
func HandleResponse(ctx context.Context) {
	fmt.Printf(
		"handling response for %v (%v)",
		UserId(ctx),
		AuthToken(ctx),
	)
}
~~~

运行结果：`handling response for jane (abc123)`

现在有一种类型安全的函数来从context获取值，如果消费者在不同的包中，他们不会知道或关心用于存储信息的ky。
但是，这种技术确实会造成问题。（循环依赖）
在前面的例子里，假如 ProcessRequest 在 process 包中、HandleResponse 在 response 包中。
process 包需要导入 response 包，调用函数。而 context 的 key 定义在 process 包中，response 包需要导入 process 包。
会造成循环依赖。

这会迫使体系结构设计时，将所有导入的数据类型放在一个包中。这也许是件好事。

关于 context 中存储什么样的数据是有争议的，因为它可以存储任意数据，并且类型不安全会引发错误。

关于什么是适当的、最普遍的指导，下面是上下文包中的下面有点含糊的注释：
> 仅将上下文值用于传输进程和请求的请求范围数据，API边界，而不是将可选参数传递给函数。

下面是启发式的建议：

1. 数据应该通过进程或API边界。
   数据应该用于在进程之间或API 边界传递请求范围的信息（如用户身份、请求 ID、跟踪信息等）。
2. 数据应该是不可变的
   如果不是，那么它就不再是请求范围的数据，而是可能被任意修改的共享状态。
3. 数据应趋向简单类型。
   数据应该是简单的类型（如 string、int、bool 等），而不是复杂的结构体或对象。
4. 数据应该是数据，而不是类型与方法。
   数据应该是纯粹的数据（如 userID、requestID 等），而不是包含方法或行为的类型。
5. 数据应该有助于修饰操作，而不是驱动它们。
   数据应该用于修饰操作（如提供额外的上下文信息），而不是驱动操作（如控制算法的行为）。
