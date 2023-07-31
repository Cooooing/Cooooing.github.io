---
title: lambda表达式的使用
date: 2023-07-27 13:58:18
tags:
- java
- lambda
- 函数式编程
categories:
- 学习笔记
---

## 函数式编程

在使用 lambda 之前，要先了解下函数式编程。
[函数式编程-wiki](https://zh.wikipedia.org/wiki/%E5%87%BD%E6%95%B0%E5%BC%8F%E7%BC%96%E7%A8%8B)

函数式编程，或称函数程序设计、泛函编程（英语：Functional programming），是一种编程范型，它将电脑运算视为函数运算，并且避免使用程序状态以及可变物件。
它的特点就是，**函数和其他变量一样，可以作为参数传递给其他函数，也可以作为其他函数的返回值。**

可以作为参数，意味着函数嵌套，数学里的高阶函数 f(g(x)) 这种。
可以作为返回值，可以实现惰性计算。（在需要结果时才对其进行计算，避免不必要的运算，节约内存。

简单写下吧，概念性的东西不是我所擅长的。重点就是 函数也可以作为变量

## lambda 表达式

Lambda 是 JDK8 中一个语法糖。他可以对某些匿名内部类的写法进行简化。（但是不能完全替代匿名内部类的使用
它是函数式编程思想的一个重要体现。让我们不用关注是什么对象。而是更关注我们对数据进行了什么操作。

下面直接举例子，关于线程的创建
~~~java
public class Main {

    public static void main(String[] args) {

        // 使用匿名内部类的方式
        new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println(Thread.currentThread().getName() + " run");
            }
        }).start();

        // 简化匿名内部类的方式
        new Thread(() -> {
            System.out.println(Thread.currentThread().getName() + " run");
        }).start();
        
        // lambda 表达式简化
        new Thread(() -> System.out.println(Thread.currentThread().getName() + " run")).start();

    }
}
~~~

使用 lambda 的情况：要求实现的接口是 函数式接口
函数式接口可以被隐式转换为 lambda 表达式。
那么什么是函数式接口？看看上面例子中 Runnable接口 的实现：

~~~java
package java.lang;

// 注释...
@FunctionalInterface
public interface Runnable {
    // 注释...
    public abstract void run();
}
~~~

简单的：
函数式接口(Functional Interface)就是一个有且仅有一个抽象方法，但是可以有多个非抽象方法的接口。

具体的：
函数式接口：
1. 有且仅有一个抽象方法。
2. 可以有 默认（default）方法，因为有默认实现，不是抽象的。
3. 接口默认继承java.lang.Object，所以如果接口显示声明覆盖了Object中方法，那么也不算抽象方法。
4. @FunctionalInterface 不是必须的，如果一个接口符合"函数式接口"定义，那么加不加该注解都没有影响。加上该注解能够更好地让编译器进行检查。如果编写的不是函数式接口，但是加上了 @FunctionInterface，那么编译器会报错。

所以 lambda 表达式主要是对这种函数式接口的简化。
它的主要原则：**可推导可省略**

因为知道传入参数的类型，所以 new 匿名内部类的步骤可以省略。
因为这个接口只有一个抽象方法需要实现，所以方法名可以省略。
只有一个方法，那么这个方法的参数类型和返回值类型也可以省略。

最后简化的结果就是 `(参数) -> {方法体}` 
都省这么多了，那就再省一点。当参数值有一个时，小括号也可以省略；当方法体只有一条语句时，大括号也可以省略。
就变成了 `一个参数 -> 语句`

## jdk 实现

java.util.function 它包含了很多类，用来支持 Java的 函数式编程。

主要的四个类是：
Function<T, R> 接受一个参数，返回一个结果。
Consumer<T> 接受一个参数，执行一些操作，无返回值。
Supplier<T> 不接受参数，生成一个值，并返回一个值。
Predicate<T> 接受一个参数，返回一个布尔值。

其余基本是这四个的拓展。
Bi前缀为接收两个参数，以及指定特定类型。不像这四个使用的都是泛型。

下面是它们接口的源码，很简单。

~~~java
package java.util.function;

import java.util.Objects;

/**
 * Represents a function that accepts one argument and produces a result.
 */
@FunctionalInterface
public interface Function<T, R> {

    /**
     * Applies this function to the given argument.
     */
    R apply(T t);

    /**
     * Returns a composed function that first applies the {@code before}
     * function to its input, and then applies this function to the result.
     * If evaluation of either function throws an exception, it is relayed to
     * the caller of the composed function.
     */
    default <V> Function<V, R> compose(Function<? super V, ? extends T> before) {
        Objects.requireNonNull(before);
        return (V v) -> apply(before.apply(v));
    }

    /**
     * Returns a composed function that first applies this function to
     * its input, and then applies the {@code after} function to the result.
     * If evaluation of either function throws an exception, it is relayed to
     * the caller of the composed function.
     */
    default <V> Function<T, V> andThen(Function<? super R, ? extends V> after) {
        Objects.requireNonNull(after);
        return (T t) -> after.apply(apply(t));
    }

    /**
     * Returns a function that always returns its input argument.
     */
    static <T> Function<T, T> identity() {
        return t -> t;
    }
}
~~~

~~~java
package java.util.function;

import java.util.Objects;

/**
 * Represents an operation that accepts a single input argument and returns no
 * result. Unlike most other functional interfaces, {@code Consumer} is expected
 * to operate via side-effects.
 */
@FunctionalInterface
public interface Consumer<T> {

    /**
     * Performs this operation on the given argument.
     */
    void accept(T t);

    /**
     * Returns a composed {@code Consumer} that performs, in sequence, this
     * operation followed by the {@code after} operation. If performing either
     * operation throws an exception, it is relayed to the caller of the
     * composed operation.  If performing this operation throws an exception,
     * the {@code after} operation will not be performed.
     */
    default Consumer<T> andThen(Consumer<? super T> after) {
        Objects.requireNonNull(after);
        return (T t) -> { accept(t); after.accept(t); };
    }
}
~~~

~~~java
package java.util.function;

/**
 * Represents a supplier of results.
 */
@FunctionalInterface
public interface Supplier<T> {

    /**
     * Gets a result.
     */
    T get();
}
~~~

~~~java
package java.util.function;

import java.util.Objects;

/**
 * Represents a predicate (boolean-valued function) of one argument.
 */
@FunctionalInterface
public interface Predicate<T> {

    /**
     * Evaluates this predicate on the given argument.
     */
    boolean test(T t);

    /**
     * Returns a composed predicate that represents a short-circuiting logical
     * AND of this predicate and another.  When evaluating the composed
     * predicate, if this predicate is {@code false}, then the {@code other}
     * predicate is not evaluated.
     */
    default Predicate<T> and(Predicate<? super T> other) {
        Objects.requireNonNull(other);
        return (t) -> test(t) && other.test(t);
    }

    /**
     * Returns a predicate that represents the logical negation of this
     * predicate.
     */
    default Predicate<T> negate() {
        return (t) -> !test(t);
    }

    /**
     * Returns a composed predicate that represents a short-circuiting logical
     * OR of this predicate and another.  When evaluating the composed
     * predicate, if this predicate is {@code true}, then the {@code other}
     * predicate is not evaluated.
     */
    default Predicate<T> or(Predicate<? super T> other) {
        Objects.requireNonNull(other);
        return (t) -> test(t) || other.test(t);
    }

    /**
     * Returns a predicate that tests if two arguments are equal according
     * to {@link Objects#equals(Object, Object)}.
     */
    static <T> Predicate<T> isEqual(Object targetRef) {
        return (null == targetRef)
                ? Objects::isNull
                : object -> targetRef.equals(object);
    }
}
~~~

关于它们默认方法的使用，这里也举一个小例子来说明。
关于 FUnction<T, R> 默认方法 compose 和 andThen 的使用：
~~~java
public class Main {
    public static void main(String[] args) {
        // 使用 lambda 定义 Function 的实现
        Function<String, String> f1 = s -> s.toUpperCase();
        Function<String, String> f2 = s -> s + " world";
        // f1 执行之前 执行 f2 
        // HELLO WORLD
        String res1 = f1.compose(f2).apply("hello");
        // f1 执行之后 执行 f2  
        // HELLO world
        String res2 = f1.andThen(f2).apply("hello");

        System.out.println(res1);
        System.out.println(res2);
    }
}
~~~

由于这些默认函数的返回值是接口本身，所以可以很愉快的进行链式调用。

## 关于 stream 流 以及总结

得益于 Lambda 的引入，让 Java 8 中的流式操作成为可能，Java 8 提供了 stream 类用于获取数据流，它专注对数据集合进行各种高效便利操作，提高了编程效率，且同时支持串行和并行的两种模式汇聚计算。能充分的利用多核优势。

流式操作很爽，流式操作一切从这里开始。
~~~
// 为集合创建串行流
stream()
// 为集合创建并行流
parallelStream()
~~~

stream 流应该是重点，且看下回。
lambda 主要是将函数作为参数和返回值。
将计算的过程抽象为一个函数，可以将这个函数作用于其他的数据，也可以让其他函数返回一个函数。
这里写的比较抽象，还是在自己写的时候更容易理解，多写吧。

这篇个人感觉写的不是很好，有些乱了。
因为从 Optional 看到 lambda 再到 stream，想去翻翻源码，然后越看越乱。
发现 stream 流创建时，还分为并行流和串行流。~~和多线程有关的没一个简单的啊~~
决定先整理一点，缓一缓。

## 其他参考

[函数式编程-入门篇章](https://zhuanlan.zhihu.com/p/271041158)
[函数式编程之惰性求值](https://zhuanlan.zhihu.com/p/624336766)
[函数式编程的核心思想](https://zhuanlan.zhihu.com/p/54951759)
[Java高级特性----函数式编程的使用](https://zhuanlan.zhihu.com/p/338300348)
[Java 8 函数式接口](https://www.runoob.com/java/java8-functional-interfaces.html)

[Lambda表达式和匿名内部类的区别](https://zhuanlan.zhihu.com/p/351874349)
[Java 8 Lambda 表达式介绍](https://www.wdbyte.com/2019/11/jdk/jdk8-lambda/)
[Java Lambda 表达式](https://www.runoob.com/java/java8-lambda-expressions.html)
[Java8新特性 Lambda底层实现原理](https://segmentfault.com/a/1190000023747150?utm_source=tag-newest)



