---
layout: post
title: 《go语言并发之道》读书笔记-大规模并发
date: 2025-01-28 22:27:50
categories:
  - 读书笔记
tags:
  - 《go语言并发之道》
  - go
  - 并发
---

## 前言

今天是2025年1月28日，除夕夜晚上十点半。今年家里是十分的冷清，没有什么过年的氛围。
不过，可能向来如此吧。

除夕夜还在看这些，莫名有些伤感。
想起一句话：**我们是除夕夜街头，即将放飞理想的有志青年。**
也许吧，还是看书吧

## 第五章 - 大规模并发

### 异常传递

编写并发代码，特别是在分布式系统中，你的系统中非常容易出现一些奇怪问题，并且难以理解为什么会发生这种情况。
为了将你自己、你的团队、你的用户从众多的痛苦中拯救出来，你需要仔细考虑异常(error)是如何通过分布式系统传递的，以及问题最终将如何呈现给使用者。

异常处理十分的重要，首先来明确异常是什么，什么时候发生，提供了哪些好处。
出现异常表示你的系统进入了一个无法满足用户操作的状态，这个操作可能是显式的，也可能是隐式的。
这时系统需要传达几个信息：

1. 发生了什么
   这部分异常信息包含了对异常事件的描述。例如：“磁盘已满”，“连接被重置”，“证书过期”。这些信息可能是被一些代码隐式的表达出来的，你可以用一些上下文来修饰这些信息来帮助用户理解发生了什么问题。
2. 发生在什么时间、什么位置
   异常应当总是包含完整的栈轨迹信息，从调用的启动方式开始，以异常的实例结尾。栈轨迹信息不应该包含在异常消息中（这一点尤为重要），但当需要处理栈中的异常时应该很容易被找到。
   更进一步讲，异常应当包含有关其内部运行的上下文信息。例如，在分布式系统中，异常应该有一些字段用来识别发生异常的机器。发生异常后，这些信息会对你诊断系统故障原因非常有价值。
   此外，异常还应包含对应机器上的时间，并且最好是UTC时间。
3. 对用户友好的信息
   应当对展现给用户的异常信息进行自定义，以适应你的系统和用户。这些信息应该只包含前两点的概述以及相关信息。对用户友好的信息是从用户的角度考虑，给出一些信息，说明这些问题是否是暂时的，并且最好是行以内的文本。
4. 告诉用户如何获得更多的信息
   在某些情况下，用户希望知道当异常发生时，具体发生了哪些故障。展现给用户的异常信息应当提供一个ID,利用这个ID可以查询到对应的详细日志。
   这个详细日志应显示异常的完整信息：发生异常的时间（而不是异常记录的时间)，异常创建时完整的堆栈调用。包含一个堆栈轨迹的hash也有助于聚合这些异常，就像bug追踪器那样跟踪问题。

默认状态下，如果你不介人，异常信息不会包含上述所有的信息。因此，你应当保持这样一种观念，任何展现给用户的异常信息如果没包含这些信息，不是出错了就是有bug。
这引出了一个可以用来处理异常的通用模型。所有的异常都几乎都能归为以下两种分类之一：

* Bug
* 已知信息（例如：网络连接断开，磁盘写入失败等）。

Bug是一些你未在你的系统中定义的异常，或者一些“原生”的异常，就是那些极少遇到的情况。
有时这是有意为之的，在你系统最初的几次迭代中，一些罕见问题展现给用户是可以接受的。还有些时候这是意外发生的。
总之，如果你同意我所提出的方法，即“原生”异常总是bug。在确定如何传播异常时，在系统随着时间的推移如何增长以及最终向用户展示什么时，这种区别被证明是非常有用的。

当我们面向用户部分的代码收到一个格式良好的异常信息时，我们知道在代码的各个层面上，我们都小心的处理了异常，我们可以将其记录下来并打印出来供用户查看。确保异常类型的准确有效是非常重要的。
当不规范的异常或bug传递给用户时，我们也应该记录异常，但是应该向用户显示一条友好的消息，指出发生了意外的事情。如果我们在系统中支持自动的异常报告，则应该将这些问题报告为bug。如果我们不这样做，我们应该建议用户提交一个bug反馈。
请注意，不规范的异常实际上也可能包含用的信息，但我们不能保证这一点，我们唯一能确认的是异常没有经过我们格式化。因此我们应该直截了当地展示一段人类可解读的信息，来展示刚刚发生的事情。

请记住，在这两种情况下，如果出现格式不规范的异常，我们将在消息中包含一个日志ID,以便用户在需要更多信息时可以查询到相关的内容。
因此，如果bug确实包含了有用的信息，有需要的用户仍然有可追踪的线索。

作者给了个简单的包装异常的例子，这里就省略了。
我通常处理异常的方式和上面是一样的，分为自定义异常（不符合业务逻辑的异常、可以预料到的系统异常）和意料之外的异常。
具体处理方式在不同的场景下区别是比较大的，这块后续会去学习errors包的处理方式。另外还有分布式的异常处理方式。

### 超时与取消

在并发代码运行时，超时（Timeouts）和取消（Cancellation）会频繁出现。
超时的处理对于创建一个易于理解的系统是至关重要的，进程被取消是其发生超时时的自然反应。

那么，为什么希望并发程序支持超时呢？

* 系统饱和
  即系统的处理能力达到上线，希望超出的请求返回超时，而不是花很长时间等待响应。
    * 请求在超时时不太可能重复
    * 没有资源存储请求（内存队列内存，持久队列磁盘）
    * 如果系统对响应或请求发送数据有时效性要求。
    * 如果一个请求可能会重复，超时会额外增加一个请求和超时的消耗。
    * 如果开销超过系统容量，可能会导致系统宕机。
* 陈旧的数据
  数据通常有一个窗口期，一般是在这个窗口中必须先处理更多的相关数据，或者处理数据的需求已经过期。
  如果一个并发进程处理数据需要的时间比这个窗口期更长，我们会想返回超时并取消并发进程。
  例如，如果我们的并发进程在长时间的等待之后响应请求，则在排队中的请求或其数据可能已经过时。
  如果事先知道这个窗口时间，那么将context.WithDeadline或context.WithTimeout创建的context.Context传递给我们的并发进程是有意义的。
  如果事先不知道窗口，我们希望并发进程的父节点能够在请求不再需要时取消并发进程。context.WithCancel是达到这个目的的最佳选择。
* 试图防止死锁
  在大型系统中，尤其是分布式系统中，有时难以理解数据流动的方式，或者可能出现的罕见情况。
  为了保证系统不会发生死锁，建议在所有并发操作中增加超时处理。超时时间不一定要接近执行并发操作所需的实际时间。
  不过超时的目的只是为了防止死锁，所以需要它足够短，使死锁的系统在合理的时间内解除阻塞即可。
  尝试通过设置超时可以将一个死锁系统转变为一个活锁系统。不过，在大型系统中，由于存在更多灵活的组件，在系统死锁后，你的系统更可能会遇到时序配置不同步的情况。
  因此，最好是在允许的时间内尽可能修复活锁，好过发生死锁后只有通过重新启动才能恢复系统。

如何建立一个并发处理来优雅地处理取消。并发进程可能被取消的原因有很多：

* 超时
  超时是隐式取消。
* 用户干预
  为了获得良好的用户体验，通常建议维持一个长链接，然后以轮询间隔将状态报告给用户，或允许用户查看他们认为合适的状态。
  当用户使用并发程序时，有时需要允许用户取消他们已经开始的操作。
* 父进程取消
  对于这个问题，如果任何一种并发操作的父进程停止，那子进程也将被取消。
* 复制请求
  我们可能希望将数据发送到多个并发进程，以尝试从其中一个进程获得更快的响应。当第一个回来的时候，我们就会取消其余的进程。后面讨论

也可能有有其他原因。

那么当一个并发进程被取消时，对于正在执行的算法，及其下游消费这意味着什么？在编写可能随时终止的并发代码时，需要考虑哪些事项？

首先是并发进程的可抢占性。
如果一个原子操作执行时间非常地长，那么在确认取消与停止之间需要很长的时间。

所以需要定义我们的并发进程可抢占的周期，确保运行周期比抢占周期长的功能本身都是可抢占的。
**一个简单的方法是将你的goroutine代码段分解成小段。就是那些不可抢占的原子操作，确保它们的运行时间小于你认为可以接受的时间。**
这里还有另外一个潜在的问题：如果我们的goroutine恰好修改了共享状态(例如数据库，文件，内存数据结构)，那当goroutine被取消时会发生什么？你的goroutine会试图将这个中间状态回滚吗？回滚过程需要多长时间？
goroutine已经接收到了停止的信号，所以它不应该花太长的时间来回滚它之前的工作，对吧？
就如何处理这个问题很难给出通用的建议，因为你的算法的性质很大程度上决定了你应当如何解决这个问题。
然而，如果你将对共享状态的修改保特在一个很小的范围内，并且确保这些修改很容易回滚，那么你可以很好的处理取消。
如果可能的话，将中间结果存储在内存，然后尽可能快的修改状态。

另外，还需要关注重复消息的问题。
假设有一个管道，它有三个阶段：生成阶段，阶段A和阶段B。
生成阶段通过记录上一次channel被读取的时间，来监控阶段A持续的时间。
如果当前实例变得不正常，阶段B在处理中时，实例A被取消。新的请求则会产生新的实例A2。但是阶段B会受到重复的消息。
有很多种方法可以避免发送重复的消息。**最简单的方法（也是我推荐的方法）是让一个父goroutine在子goroutine已经发送完结果之后发送一个取消信号。这需要各阶段之间的双向通信（心跳）。**
其他方法是：

1. 接收到的第一个或最后一个消息，如果你的算法允许，或者你的并发进程是幂等的，那么你可以简单地在下游进程中允许可能存在的重复消息，并从接收到的第一个消息或最后一个消息中挑选一个处理。
2. 像父goroutine确认权限，使用双向通信明确请求允许在B的channel上执行写人操作，这比心跳更安全。然而，在实践中很少这样做，因为它比心跳更加复杂，而心跳更普遍且有效。

### 心跳

心跳是并发进程向外界发出信号的一种方式。这个说法来自人体解剖学，在解剖学中心跳反应了观察者的生命体征。

在设计并发程序时，一定要考虑到超时和取消。如果从一开始就忽略超时和取消，然后在后期尝试加入它们，这有点像在蛋糕烤好后再加鸡蛋。
在并发编程中，有几个的原因使心跳变得格外有趣。它允许我们对系统有深入的了解，当系统工作不正常时，它可以对系统进行测试。
下面讨论两种不同类型的心跳：

* 在一段时间间隔内发出的心跳。
* 在工作单元开始时发出的心跳

在一段时间间隔上发出的心跳对并发代码很有用，尤其是当它在处于等待状态。因为你不知道新的事件什么时候会被触发，你的goroutine可能会在等待某件事情发生的时候挂起。
心跳是告诉监听程序一切安好的一种方式，而静默状态也是预料之中的。
下面的代码演示了一个会发出心跳的goroutine:

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	doWork := func(done <-chan any, pulseInterval time.Duration) (<-chan any, <-chan time.Time) {
		heartbeat := make(chan any) // 建立一个发送心跳的 channel
		results := make(chan time.Time)
		go func() {
			defer close(heartbeat)
			defer close(results)
			pulse := time.Tick(pulseInterval)       // 设置心跳的间隔时间
			workGen := time.Tick(2 * pulseInterval) // 另一个模拟工作结果的生成间隔
			sendPulse := func() {
				select {
				case heartbeat <- struct{}{}:
				default: // 添加默认语句，避免阻塞。因为可能没有人接受心跳，从 goroutine 发送信息是重要的，但心跳却不一定重要。
				}
			}
			sendResult := func(r time.Time) {
				for {
					select {
					case <-done:
						return
					case <-pulse: // 和 done channel 一样，当执行发送或接收时，也需要发送一个包含心跳的分支
						sendPulse()
					case results <- r:
						return
					}
				}
			}
			for {
				select {
				case <-done:
					return
				case <-pulse: // 和 done channel 一样，当执行发送或接收时，也需要发送一个包含心跳的分支
					sendPulse()
				case r := <-workGen:
					sendResult(r)
				}
			}
		}()
		return heartbeat, results
	}
	done := make(chan any)
	time.AfterFunc(10*time.Second, func() { close(done) }) // 10秒后关闭 done channel

	const timeout = 2 * time.Second               // 设置超时时间
	heartbeat, results := doWork(done, timeout/2) // 心跳间隔为超时时间的一半，以便心跳有额外的响应时间
	for {
		select {
		case _, ok := <-heartbeat: // 处理心跳。知道心跳会有消息，如果什么都没收到，便知道是 goroutine 出了问题
			if !ok {
				return
			}
			fmt.Println("pulse")
		case r, ok := <-results:
			if !ok {
				return
			}
			fmt.Printf("results %v\n", r.Second())
		case <-time.After(timeout): // 如果没有收到心跳或其他消息，就会超时
			return
		}
	}
}
~~~

输出如下：

~~~
pulse
pulse
results 18
pulse
pulse
results 20
pulse
pulse
results 22
pulse
pulse
results 24
pulse
results 26
~~~

下面来模拟一个异常的 goroutine 。它将在两次迭代后停止，但不关闭任何一个 channel：

~~~go
package main

import (
	"fmt"
	"time"
)

func main() {
	doWork := func(done <-chan any, pulseInterval time.Duration) (<-chan any, <-chan time.Time) {
		heartbeat := make(chan any)
		results := make(chan time.Time)
		go func() {
			pulse := time.Tick(pulseInterval)
			workGen := time.Tick(2 * pulseInterval)
			sendPulse := func() {
				select {
				case heartbeat <- struct{}{}:
				default:
				}
			}
			sendResult := func(r time.Time) {
				for {
					select {
					case <-pulse:
						sendPulse()
					case results <- r:
						return
					}
				}
			}
			for i := 0; i < 2; i++ {
				select {
				case <-done:
					return
				case <-pulse:
					sendPulse()
				case r := <-workGen:
					sendResult(r)
				}
			}
		}()
		return heartbeat, results
	}
	done := make(chan any)
	time.AfterFunc(10*time.Second, func() { close(done) })

	const timeout = 2 * time.Second
	heartbeat, results := doWork(done, timeout/2)
	for {
		select {
		case _, ok := <-heartbeat:
			if !ok {
				return
			}
			fmt.Println("pulse")
		case r, ok := <-results:
			if !ok {
				return
			}
			fmt.Printf("results %v\n", r.Second())
		case <-time.After(timeout):
			fmt.Println("worker goroutine is not healthy!")
			return
		}
	}
}
~~~

输出如下：

~~~
pulse
pulse
worker goroutine is not healthy!
~~~

心跳和超时在正常工作，通过心跳可以确定 goroutine 是否在正常运行，从而避免死锁。

### 复制请求

对于某些应用来说，尽可能快地接收响应是重中之重。例如，程序正在处理用户的HTTP请求，或者检索一个数据块。
在这些情况下，你可以进行权衡：你可以将请求分发到多个处理程序（无论是goroutine,进程，还是服务器），其中一个将比其他处理程序返回更快，你可以立即返回结果。
缺点是为了维特多个实例的运行，你将不得不消耗更多的资源。

如果这种复制是在内存中进行的，消耗则没有那么大，但是如果多个处理程序要多个进程，服务器甚至是数据中心，那可能会变得相当昂贵。
所以你需要决定这么做是否值得。

来看看如何在单个进程中制造复制请求。使用多个goroutine作为处理程序，并且goroutine将随机休眠一段时间以模似不同的负载，休眠时间在1到6秒之间。
这将使我们处理程序在不同的时间返回结果，并且我们可以看到复制请求如何更快的返回结果。
下面是一个在10个处理程序上复制模拟请求的例子：

~~~go
package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

func main() {
	dowork := func(done <-chan any, id int, wg *sync.WaitGroup, result chan<- int) {
		started := time.Now()
		defer wg.Done()
		// 模拟随机负找
		simulatedLoadTime := time.Duration(1+rand.Intn(5)) * time.Second
		select {
		case <-done:
		case <-time.After(simulatedLoadTime):
		}
		select {
		case <-done:
		case result <- id:
		}
		took := time.Since(started)
		// 显示处理程序需要多长时间
		if took < simulatedLoadTime {
			took = simulatedLoadTime
		}
		fmt.Printf("%v took %v\n", id, took)
	}
	done := make(chan any)
	result := make(chan int)
	var wg sync.WaitGroup
	wg.Add(10)
	for i := 0; i < 10; i++ { // 启动 10 个处理程序
		go dowork(done, i, &wg, result)
	}
	firstReturned := <-result // 获取处理程序组的第一个结果
	close(done)               // 取消其余处理程序
	wg.Wait()
	fmt.Printf("Received an answer from %v\n", firstReturned)
}
~~~

输出结果：

~~~
6 took 1.0010419s
9 took 2s
0 took 3s
8 took 2s
7 took 2s
4 took 4s
3 took 4s
5 took 1.0010419s
1 took 2s
2 took 2s
Received an answer from 6
~~~

这里第六个处理程序返回的最快。
注意，所有的处理程序都应该是尽可能的等价的，有相同的机会处理请求。
但需要复制请求的场景很少，因为建立和维护这样的系统有非常大的代价。除非对响应速度的要求可以接受这样的代价。
另外，这种方式天然地提供了容错和可扩展性。（分布式处理，不过只取第一个响应的，而取消其他。比较浪费

### 速率限制

限制某种资源在某段时间内被访问的次数。资源可以是任何东西：API连接、磁盘读写、网络包、异常...
速率限制允许将系统的性能和隐定性平衡在可控范围内。如果需要扩大这些限制，可以在大量测试和等待后，以可控的方式进行拓展。

大多数的限速是基于令牌桶算法的。这很容易理解，而且相对容易实现。
如果要访问资源，你必须拥有资源的访问令牌，没有令牌的请求会被拒绝。
现在假设这些令牌存储在一个等待被检索使用的桶中。桶的深度为d,表示一个桶可以容纳d个访问令牌。
例如，存储桶深度为五，则可以存放五个令牌。每当你需要访问资源时，都会在桶中删除一个令牌。
如果你的存储桶包含五个令牌，前五次访问没有问题，操作正常进行；但是在第六次尝试时，就没有访问令牌可用。你的请求必须排队等待，直到令牌可用，或者被拒绝操作。

那如何补充令牌，我们总是能获得一个新的吗？在令牌桶算法中，将r定义为向桶中添加令牌的速率。它可以是一纳秒或一分钟。
这就是我们通常认为的速率限制：因为我们必须等到新的令牌可用，我们将操作速度限制在这个频率下。

现在我们有两个设置项可以修改：有多少个令牌可以立即使用d,桶的深度，以及它们补充的速度r。在这两者之间，我们可以平衡突发性和限制整体速率。
突发性指的是当存储桶已满时可以进行多少次请求。

下面是使用`golang.org/x/time/rate`包实现的例子，同时对磁盘访问和网络访问添加限制。

~~~go
package main

import (
	"context"
	"golang.org/x/time/rate"
	"log"
	"os"
	"sort"
	"sync"
	"time"
)

func main() {
	defer log.Printf("Done.")
	log.SetOutput(os.Stdout)
	log.SetFlags(log.Ltime | log.LUTC)

	apiConnection := Open()
	var wg sync.WaitGroup
	wg.Add(20)

	for i := 0; i < 10; i++ {
		go func() {
			defer wg.Done()
			err := apiConnection.ReadFile(context.Background())
			if err != nil {
				log.Printf("cannot ReadFile: %v", err)
			}
			log.Printf("ReadFile")
		}()
	}

	for i := 0; i < 10; i++ {
		go func() {
			defer wg.Done()
			err := apiConnection.ResolveAddress(context.Background())
			if err != nil {
				log.Printf("cannot ResolveAddress: %v", err)
			}
			log.Printf("ResolveAddress")
		}()
	}

	wg.Wait()
}
func Per(eventCount int, duration time.Duration) rate.Limit {
	return rate.Every(duration / time.Duration(eventCount))
}
func Open() *APIConnection {
	return &APIConnection{
		apiLimiter: MultiLimiter( // 为API调用设置限速器，每秒请求数与每分钟请求数都有限制
			rate.NewLimiter(Per(2, time.Second), 2), // 第一个参数为频率，第二个为桶大小
			rate.NewLimiter(Per(10, time.Minute), 10),
		),
		diskLimiter: MultiLimiter( // 为磁盘操作设置限速器，每秒一次
			rate.NewLimiter(rate.Limit(1), 1),
		),
		networkLimiter: MultiLimiter( // 为网络操作设置限速器，每秒3次
			rate.NewLimiter(Per(3, time.Second), 3),
		),
	}
}

type APIConnection struct {
	networkLimiter RateLimiter
	diskLimiter    RateLimiter
	apiLimiter     RateLimiter
}

func (a *APIConnection) ReadFile(ctx context.Context) error {
	// 读取文件时，同时使用API限速器和磁盘限速器的限制
	if err := MultiLimiter(a.apiLimiter, a.diskLimiter).Wait(ctx); err != nil {
		return err
	}
	// 假设执行一些逻辑
	return nil
}

func (a *APIConnection) ResolveAddress(ctx context.Context) error {
	// 网络访问时，同时使用API限速器和网络限速器的限制
	if err := MultiLimiter(a.apiLimiter, a.networkLimiter).Wait(ctx); err != nil {
		return err
	}
	// 假设执行一些逻辑
	return nil
}

type RateLimiter interface { // 定义 RateLimiter 接口，使 MultiLimiter 可以递归地定义其他 MultiLimiter 实例。
	Wait(context.Context) error
	Limit() rate.Limit
}

func MultiLimiter(limiters ...RateLimiter) *multiLimiter {
	byLimit := func(i, j int) bool {
		return limiters[i].Limit() < limiters[j].Limit()
	}
	sort.Slice(limiters, byLimit) // 根据每个 RateLimiter 的 Limit() 进行排序
	return &multiLimiter{limiters: limiters}
}

type multiLimiter struct {
	limiters []RateLimiter
}

func (l *multiLimiter) Wait(ctx context.Context) error {
	for _, l := range l.limiters {
		if err := l.Wait(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (l *multiLimiter) Limit() rate.Limit {
	return l.limiters[0].Limit() // 返回限制最多的限速器（已排序
}
~~~

输出如下：

~~~
09:09:32 ReadFile
09:09:33 ReadFile
09:09:33 ResolveAddress
09:09:34 ReadFile
09:09:35 ReadFile
09:09:36 ReadFile
09:09:36 ResolveAddress
09:09:37 ReadFile
09:09:38 ResolveAddress
09:09:38 ReadFile
09:09:39 ReadFile
09:09:44 ResolveAddress
09:09:50 ReadFile
09:09:56 ResolveAddress
09:10:02 ResolveAddress
09:10:08 ResolveAddress
09:10:14 ResolveAddress
09:10:20 ResolveAddress
09:10:26 ResolveAddress
09:10:32 ReadFile
09:10:32 Done.
~~~

### 治愈异常的goroutine

在长期运行的后台程序中，经常会有一些长时间运行的goroutine。这些goroutine经常处于阻塞状态，等待数据以某种方式到达，然后唤醒它们，进行一些处理，再返回一些数据。
有时候，这些goroutine依赖于一些控制不太好的资源。也许一个goroutine需要从接收到的请求中提取数据，或者它正在监听一个临时文件。
问题在于，如果没有外部干预，一个goroutine很容易进入一个不正常的状态，并且无法恢复。
抛开这些担忧，你甚至可以说，goroutine本身不应该关心其如何从一个异常状态回复过来。
在一个长期运行的程序中，建立一个机制来监控你的goroutine是否处于健康的状态是很用的，当他们变得异常时，就可以尽快重启。
我们将这个重启goroutine的过程称为“治愈”(Healing）。

为了治愈goroutine,我们需要使用心跳模式来检查我们正在监控的goroutine是否活跃。
心跳的类型取决于你想要监控的内容，但是如果你的goroutine有可能会产生活锁，确保心跳包含某些信息，表明该goroutine在正常的工作而不仅仅是活着。
把监控goroutine的健康这段逻辑称为管理员，它监视一个管理区的goroutine。如果有goroutine变得不健康，管理员将负责重新启动这个管理区的goroutine。

~~~go
package main

import (
	"log"
	"os"
	"time"
)

func main() {
	var or func(channels ...<-chan any) <-chan any
	or = func(channels ...<-chan any) <-chan any {
		switch len(channels) {
		case 0:
			return nil
		case 1:
			return channels[0]
		}

		orDone := make(chan any)
		go func() {
			defer close(orDone)

			switch len(channels) {
			case 2:
				select {
				case <-channels[0]:
				case <-channels[1]:
				}
			default:
				select {
				case <-channels[0]:
				case <-channels[1]:
				case <-channels[2]:
				case <-or(append(channels[3:], orDone)...):
				}
			}
		}()
		return orDone
	}
	type startGoroutineFn func(done <-chan any, pulseInterval time.Duration) (heartbeat <-chan any) // 定义一个可以监控和重启的goroutine的信号

	newSteward := func(timeout time.Duration, startGoroutine startGoroutineFn) startGoroutineFn { // 管理员监控goroutine需要timeout变量和启动goroutine的startGoroutine函数，同时，返回一个startGoroutineFn，说明管理员本身也是可以监控的
		return func(done <-chan any, pulseInterval time.Duration) <-chan any {
			heartbeat := make(chan any)
			go func() {
				defer close(heartbeat)

				var wardDone chan any
				var wardHeartbeat <-chan any
				startWard := func() { // 定义一个闭包，实现一个统一的方法来启动正在监控的goroutine
					wardDone = make(chan any)                                     // 停止信号，用来停止正在监控的goroutine
					wardHeartbeat = startGoroutine(or(wardDone, done), timeout/2) // 启动将要监控的goroutine
				}
				startWard()
				pulse := time.Tick(pulseInterval)

				for {
					timeoutSignal := time.After(timeout)
					// 管理员自身心跳
					select {
					case <-pulse:
						select {
						case heartbeat <- struct{}{}:
						default:
						}
					default:
					}
					// 监控goroutine
					select {
					case <-wardHeartbeat: // 如果收到心跳，将继续监控
						break
					case <-timeoutSignal: // 在暂停期间没有收到goroutine心跳，会进行重启
						log.Println("steward: ward unhealthy; restarting")
						close(wardDone)
						startWard()
						break
					case <-done:
						return
					}
				}
			}()

			return heartbeat
		}
	}
	log.SetOutput(os.Stdout)
	log.SetFlags(log.Ltime | log.LUTC)

	doWork := func(done <-chan any, _ time.Duration) <-chan any {
		log.Println("ward: Hello, I'm irresponsible!")
		go func() {
			<-done // 这个goroutine没有做任何事，只是等待被取消
			log.Println("ward: I am halting.")
		}()
		return nil
	}
	doWorkWithSteward := newSteward(4*time.Second, doWork) // 为上面的goroutine创建一个管理员，设置超时时间为4秒

	done := make(chan any)
	time.AfterFunc(9*time.Second, func() { // 设置9秒后停止管理员和goroutine
		log.Println("main: halting steward and ward.")
		close(done)
	})

	for range doWorkWithSteward(done, 4*time.Second) {
	} // 启动管理员，并在其心跳范围内防止测试停止
	log.Println("Done")
}
~~~

它可以一直监控一个goroutine，当goroutine不活跃时，管理员会重新启动它。输出如下：

~~~
03:28:14 ward: Hello, I'm irresponsible!
03:28:18 steward: ward unhealthy; restarting
03:28:18 ward: Hello, I'm irresponsible!
03:28:18 ward: I am halting.
03:28:22 steward: ward unhealthy; restarting
03:28:22 ward: Hello, I'm irresponsible!
03:28:22 ward: I am halting.
03:28:23 main: halting steward and ward.
03:28:23 ward: I am halting.
03:28:26 Done
~~~

上面的输出看起来符合预期，在其超时时重启它。
但是它所管理goroutine有些简单，除了取消和心跳所需要的东西之外，不接受任何参数，也不返回任何参数。
下面的例子根据离散值生成一个整数流，并在遇到负数时结束，使用闭包来对其进行包装，可以添加一些参数和返回值。

~~~go
package main

import (
	"fmt"
	"log"
	"os"
	"time"
)

func main() {
	var or func(channels ...<-chan any) <-chan any
	or = func(channels ...<-chan any) <-chan any {
		switch len(channels) {
		case 0:
			return nil
		case 1:
			return channels[0]
		}

		orDone := make(chan any)
		go func() {
			defer close(orDone)

			switch len(channels) {
			case 2:
				select {
				case <-channels[0]:
				case <-channels[1]:
				}
			default:
				select {
				case <-channels[0]:
				case <-channels[1]:
				case <-channels[2]:
				case <-or(append(channels[3:], orDone)...):
				}
			}
		}()
		return orDone
	}
	type startGoroutineFn func(done <-chan any, pulseInterval time.Duration) (heartbeat <-chan any)

	newSteward := func(timeout time.Duration, startGoroutine startGoroutineFn) startGoroutineFn {
		return func(done <-chan any, pulseInterval time.Duration) <-chan any {
			heartbeat := make(chan any)
			go func() {
				defer close(heartbeat)

				var wardDone chan any
				var wardHeartbeat <-chan any
				startWard := func() {
					wardDone = make(chan any)
					wardHeartbeat = startGoroutine(or(wardDone, done), timeout/2)
				}
				startWard()
				pulse := time.Tick(pulseInterval)

				for {
					timeoutSignal := time.After(timeout)
					select {
					case <-pulse:
						select {
						case heartbeat <- struct{}{}:
						default:
						}
					default:
					}
					select {
					case <-wardHeartbeat:
						break
					case <-timeoutSignal:
						log.Println("steward: ward unhealthy; restarting")
						close(wardDone)
						startWard()
						break
					case <-done:
						return
					}
				}
			}()

			return heartbeat
		}
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
		valStream := make(chan any)
		go func() {
			defer close(valStream)
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
	doWorkFn := func(done <-chan any, intList ...int) (startGoroutineFn, <-chan any) { // 添加所需的参数和返回值
		intChanStream := make(chan (<-chan any)) // 创建作为桥接模式一部分的 channel
		intStream := bridge(done, intChanStream)
		doWork := func(done <-chan any, pulseInterval time.Duration) <-chan any { // 创建一个被监控的闭包
			intStream := make(chan any) // 实例化 channel，与 goroutine 通信
			heartbeat := make(chan any)
			go func() {
				defer close(intStream)
				select {
				case intChanStream <- intStream: // 将用来通信的 channel 传递给 bridge
				case <-done:
					return
				}
				for {
					for _, intVal := range intList {
						if intVal < 0 {
							log.Printf("negative value: %v\n", intVal) // 遇到负数时给出错误信息并从 goroutine 返回
							return
						}
						pulse := time.Tick(pulseInterval)
						select {
						case <-pulse:
							select {
							case heartbeat <- struct{}{}:
							default:
							}
						default:
						}
						select {
						case intStream <- intVal:
							break
						case <-done:
							return
						}
					}
				}
			}()
			return heartbeat
		}
		return doWork, intStream
	}
	log.SetFlags(log.Ltime | log.LUTC)
	log.SetOutput(os.Stdout)

	done := make(chan any)
	defer close(done)

	doWork, intStream := doWorkFn(done, 1, 2, -1, 3, 4, 5)
	doWorkWithSteward := newSteward(1*time.Millisecond, doWork)
	doWorkWithSteward(done, 1*time.Hour)

	for intVal := range take(done, intStream, 6) {
		fmt.Printf("Received: %v\n", intVal)
	}
}
~~~

输出如下：

~~~
Received: 1
07:22:25 negative value: -1
Received: 2
07:22:25 steward: ward unhealthy; restarting
Received: 1
07:22:25 negative value: -1
Received: 2
07:22:25 steward: ward unhealthy; restarting
Received: 1
07:22:25 negative value: -1
Received: 2
~~~

## 第六章 - goroutine 和 Go语言运行时

### 工作窃取

Go语言将调度多个goroutine,使其在系统线程上运行。它使用的算法被称为工作窃取策略。

1. 朴素策略（公平调度策略）
   在所有可用处理器之间平均分配任务。但是在fork-join模型中，任务可能会相互依赖，导致处理器空闲等待。另外还可能导致缓存的位置偏差，因为调用这些数据的任务跑在其他处理器上。
2. 工作窃取算法：集中队列算法
   使用一个集中化的FIFO队列来存储待处理的任务。处理器从队列中获取任务进行执行。但是反复进出临界区会导致较高的竞争开销。也有缓存偏移的问题，集中式队列需要频繁地加载到每个处理器的缓存中，影响缓存效率。
3. 工作窃取算法：分布式队列算法
   每个处理器拥有独立的双端队列。解决了集中式队列的竞争问题，提高了并行度和缓存命中率。每个处理器有自己的队列，减少了竞争开销。任务在同一处理器上执行，提高了缓存命中率。

在goroutine开始的时候fork,join点是两个或更多的goroutine通过channel或sync包中的类型进行同步时。
工作窃取算法遵循一些基本原则。对于给定的线程：

1. 在fork点，将任务添加到与线程关联的双端队列的尾部。
2. 如果线程空闲，则选取一个随机的线程，从它关联的双端队列头部窃取工作。
3. 如果在未准备好的join点（即与其同步的goroutine还没有完成），则将工作从线程的双端队列尾部出栈。
4. 如果线程的双端队列是空的，则：
    1. 暂停加入。
    2. 从随机线程关联的双端队列中窃取工作。

正在执行的线程会在队列的尾部人栈或者（必要时）出栈一个任务。位于队列尾部的任务有这样几个有趣的特性：

* 这是最有可能完成父进程join的任务。
  更快地完成join意味着我们的程序性能会更好，在内存中停留的时间更少。
* 这是最有可能存在于处理器缓存中的任务。
  因为这是这个线程在开始当前工作前的最后一个任务。所以当前线程执行需要的信总可能仍然存在于CPU的缓存之中。这意味着缓存的命中率更高

#### 窃取任务还是续体

什么样的任务进行排队和窃取。fork-join模式下两种选择：新任务和续体。

窃取任务是指一个空闲的处理器从另一个忙碌的处理器的任务队列中获取任务进行执行。
窃取续体是指一个处理器从另一个处理器的任务队列中获取未完成的goroutine（或称为续体）并继续执行。

G0语言的周度器有三个主要的概念：
* G goroutine.
* M OS线程（在源代码中也被称为机器）。 
* P 上下文（在源代码中也被称为处理器）。

Go语言的工作窃取算法对续体进行入队和窃取。
当一个执行线程到达一个join point时，该线程必须暂停执行，等待回调以窃取任务。

### 向开发人员展示所有这些信息

关键字 go 连接所有的这些

在函数或闭包之前敲上go,就会有一个会自动调度的任务，它将以最有效率的方式利用它所在的机器。
作为开发者，我们依旧使用我们最熟悉的原语：function。我们不必理解新的处理方式，复杂的数据结构或调度算法。

## End

很好的书，有些从未见过的go代码。对于熟悉go并发的使用非常好。
最后一章关于go原理部分有些抽象，后续可能会单独写一篇关于go线程模型的文章以深入了解下。

现在，该去重构我的聊天室应用了。
