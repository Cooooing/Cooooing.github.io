---
layout: post
title: Collector收集器的使用
date: 2024-05-27 17:05:59
tags:
  - java
  - stream
categories:
  - 学习笔记
---

## 前言

之前写过一些 stream 流的用法。从那之后，用 stream 流就用的很开心。
但是，有时候也会疑惑。stream 流最后的终止操作，经常会这么写：`list.stream().collect(Collectors.toList());`
虽然知道是将流的数据收集到 list 集合中，但不知道为什们这么写。
而且，也有这种简化写法：`list.stream().toList()`。在 Java16 才加入了这个写法。
更让人想知道，Collectors 返回的 Collector 收集器到底怎么使用？

另外，toList() 与 Collectors.toList() 是有区别的。
查看源码，可以看到 toList() 返回的是**不可变**的 list。
而 Collectors.toList() 返回的是**可变**的 list。

~~~java
   default List<T> toList() {
        return (List<T>) Collections.unmodifiableList(new ArrayList<>(Arrays.asList(this.toArray())));
    }
~~~

~~~java
    public static <T>
    Collector<T, ?, List<T>> toList() {
        return new CollectorImpl<>(ArrayList::new, List::add,
                                   (left, right) -> { left.addAll(right); return left; },
                                   CH_ID);
    }
~~~

后面，来说 Collector 的用法。

## collect、Collector、Collectors 区别与关联

1. collect 是 Stream 流的一个**终止方法**，会使用传入的收集器（入参）对结果执行相关的操作，这个收集器必须是 Collector 接口的实现类。
2. Collector 是一个**接口**，定义了一些方法，作用是将 Stream 流中的数据收集到集合中。
3. Collectors 是一个**工具类**，提供了很多的静态工厂方法，提供了很多常用的 Collector 接口的具体实现类，方便使用。

## Collector 接口

Collector 在 javadoc 中的描述是这样的：
> A mutable reduction operation that accumulates input elements into a mutable result container, optionally transforming the accumulated result into a final representation after all input elements have been processed. Reduction operations can be performed either sequentially or in parallel.

Collector是一种可变的汇聚操作，它将输入元素累积到一个可变的结果容器中。在所有的元素处理完成后，Collector 将累积的结果转换成一个最终的表示（这是一个可选的操作）。Collector支持串行和并行两种方式执行。

先来简单看下 Collector 接口的源码（省略两个静态 of 方法，用于构造 Collector 实现类）

~~~java

public interface Collector<T, A, R> {

    Supplier<A> supplier();
    BiConsumer<A, T> accumulator();
    BinaryOperator<A> combiner();
    Function<A, R> finisher();
    Set<Characteristics> characteristics();

    enum Characteristics {
        CONCURRENT,
        UNORDERED,
        IDENTITY_FINISH
    }
    // ...
}
~~~

Collector 接口定义了 3 个泛型、5 个接口方法、2个静态方法、3 个枚举值。

### 泛型含义

- T：输入元素的类型
- A：累积结果的容器类型
- R：最终生成的结果类型

### 接口方法含义

1. supplier 方法：用来创建一个新的可变的集合。换句话说 Supplier 用来创建一个初始的集合。
2. accumulator 方法：定义了累加器，用来将原始元素添加到集合中。
3. combiner 方法：用于对并行操作生成的各个子集合结果进行合并。**只有并行流会被调用**。
4. finisher 方法：对遍历结束后的流做最后处理。**可以省略，省略就是 `i -> (R) i;`，恒等操作**。
5. characteristics：返回一个不可变的 Characteristics 集合。它定义了收集器的行为，关于流是否可以并行归约，以及可以使用哪些优化的提示。

前四个方法都是函数式接口，可以用 lambda 表达式简化表示。
所以下面示例时使用 lambda，不单独创建实现类。

### 静态方法

两个重载的静态方法 of 都用于构造 Collector 实现类。
区别在于是否省略 finisher 方法。
最后一个参数是 characteristics 枚举，为可变长度参数列表，可传多个。

### 枚举值含义

1. UNORDERED：声明此收集器的汇总归约结果与 Stream 流元素遍历顺序无关，不受元素处理顺序影响。但是如果容器本身是有序的，那么这个收集器会保证元素顺序不变。
2. CONCURRENT：声明此收集器可以多个线程并行处理，允许并行流中进行处理。即 **supplier 方法只会被调用一次，只创建一个结果容器，并且 combiner 方法不会被执行，这个容器必须是线程安全的**。
3. IDENTITY_FINISH：声明此收集器的 finisher 方法是一个恒等操作，可以跳过。**默认值**。

> 需要注意的是
> 即使 collector 被标记为 UNORDERED 如果数据源或操作本身是有序的，那么系统的执行策略通常仍会保持这些元素的出现顺序。
> 由于在处理有序流时多个线程并发更新同一个共享的累加器容器，会导致元素的更新顺序变得不确定。所以系统通常会忽略有序源的 CONCURRENT 标记。除非同时还指定了 UNORDERED。

## 自定义 Collector 实现类

有一个数组 a,b,c,d,e,f,g
下面通过自定义的 collector 实现，返回一个 本身为 key，ascii 码为值的 map 集合。
同时，通过打印信息区分串行流与并行流的执行区别。

串行流（单线程顺序执行）
~~~java
    public static void main(String[] args) {
        Map<String, Integer> res = Stream.of("a", "b", "c", "d", "e", "f", "g")
                .collect(Collector.of(
                        () -> {
                            System.out.println(Thread.currentThread().getName() + " supplier...");
                            return new HashMap<String, Integer>();
                        },
                        (left, right) -> {
                            System.out.println(Thread.currentThread().getName() + " accumulator: " + right);
                            left.put(right, (int) right.getBytes()[0]);
                        },
                        (left, right) -> {
                            System.out.println(Thread.currentThread().getName() + " combiner: " + left + "+" + right);
                            left.putAll(right);
                            return left;
                        }
                ));
        res.forEach((k, v) -> System.out.println(k + ":" + v.toString()));
    }
~~~

串行流输出结果：
~~~
main supplier...
main accumulator: a
main accumulator: b
main accumulator: c
main accumulator: d
main accumulator: e
main accumulator: f
main accumulator: g
a:97
b:98
c:99
d:100
e:101
f:102
g:103
~~~

可以看到串行流中 supplier 方法只执行一次，并且 combiner 方法没有执行。

并行流
~~~java
    public static void main(String[] args) {
        Map<String, Integer> res = Stream.of("a", "b", "c", "d", "e", "f", "g").parallel()
                .collect(Collector.of(
                        () -> {
                            System.out.println(Thread.currentThread().getName() + " supplier...");
                            return new HashMap<String, Integer>();
                        },
                        (left, right) -> {
                            System.out.println(Thread.currentThread().getName() + " accumulator: " + right);
                            left.put(right, (int) right.getBytes()[0]);
                        },
                        (left, right) -> {
                            System.out.println(Thread.currentThread().getName() + " combiner: " + left + "+" + right);
                            left.putAll(right);
                            return left;
                        }
                ));
        res.forEach((k, v) -> System.out.println(k + ":" + v.toString()));
    }
~~~

并行流输出结果：
~~~
main supplier...
ForkJoinPool.commonPool-worker-1 supplier...
ForkJoinPool.commonPool-worker-2 supplier...
ForkJoinPool.commonPool-worker-4 supplier...
ForkJoinPool.commonPool-worker-5 supplier...
ForkJoinPool.commonPool-worker-3 supplier...
ForkJoinPool.commonPool-worker-6 supplier...
ForkJoinPool.commonPool-worker-4 accumulator: d
ForkJoinPool.commonPool-worker-1 accumulator: b
main accumulator: e
ForkJoinPool.commonPool-worker-6 accumulator: c
ForkJoinPool.commonPool-worker-2 accumulator: a
ForkJoinPool.commonPool-worker-3 accumulator: g
ForkJoinPool.commonPool-worker-5 accumulator: f
ForkJoinPool.commonPool-worker-6 combiner: {b=98}+{c=99}
ForkJoinPool.commonPool-worker-6 combiner: {a=97}+{b=98, c=99}
ForkJoinPool.commonPool-worker-5 combiner: {f=102}+{g=103}
main combiner: {d=100}+{e=101}
main combiner: {d=100, e=101}+{f=102, g=103}
main combiner: {a=97, b=98, c=99}+{d=100, e=101, f=102, g=103}
a:97
b:98
c:99
d:100
e:101
f:102
g:103
~~~

可以看出并行流的执行逻辑。
1. spliterator 分割迭代器 会将数据分割成多个片段，分割过程通常采用递归的方式动态进行，以平衡子任务的工作负载，提高资源利用率。
2. Fork/Join 框架将这些数据片段分配到多个线程和处理器核心上进行并行处理。
3. 处理完成后，结果会被汇总合并。合并过程通常也是递归进行的。

## Collectors 常用收集器

Collectors 提供了一系列的静态方法，一般情况下足够正常使用。~~不然我也不会用这么久 stream 才来详细了解 Collector 了。~~

方法比较多，很多我也没用过。这里就不一一列举用法了。
用的时候查文档吧。~~不然我和写文档有什么区别~~

