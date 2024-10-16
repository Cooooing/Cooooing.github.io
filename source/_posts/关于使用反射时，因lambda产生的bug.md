---
layout: post
title: 关于使用反射时，因lambda产生的bug
date: 2023-09-01 19:22:53
categories:
- 编程记录
tags:
- bug
- lambda
- 反射
---

## 场景

在做动态权限控制时，需要在项目启动时加载权限列表，写入数据库。以供拦截器去鉴权。
这里的权限列表是接口的路径，即权限细到每一个接口。
所以，需要**使用反射获取接口的路径**。
然后拦截器通过用户角色获取到权限列表（可访问的接口路径）后，去匹配当前请求的路径。以达到权限控制的目的。

## 问题及解决过程

前面都很顺利啊，接口路径在项目启动初始化后，成功写入数据库。因为此时的接口是我用 MybatisPlus 的模板生成器生成的，比较简单。
当接口查表，处理数据时。有些复杂了，开始使用 lambda 和 stream 流来处理查询结果。（真的很好用
兴高采烈的写完，运行项目。初始化权限的地方（通过反射获取接口路径的方法）报了 空指针异常（NPE）。
![报错](https://cooooing.github.io/images/关于使用反射时，因lambda产生的bug/报错.png)

这个时候我的第一反应是：我是不是什么地方注解写漏了。因为具体报 NPE 的地方是 @Operation(summary = "...") 注解的 summary 属性。（swagger3 的注解）
于是我打印了通过反射获取的方法的路径，因为 controller 层的方法上都有 RequestMapping 之类的注解用来映射请求的路径。
我一个 controller 里就增删改查四个方法，打印出来六个，有俩空的。难道还有幽灵方法不成。

于是打印了路径为空的方法看看。结果如下：
![空方法](https://cooooing.github.io/images/关于使用反射时，因lambda产生的bug/空方法.png)

看到 lambda ，突然就开朗了。
最后给 @Operation 做了个空判断，只将有这个注解的方法的路径写入数据库。（文档上没有的，不在权限管理里。也很合理

## 关于 lambda 的问题

问题解决了，下面就是深入一下为什么。

其实，很简单。看一下下面的代码和运行结果就知道了。（其实上面打印出来就已经知道了

~~~java
public class Test {
    public static void main(String[] args) {
        Class<?> cl1 = Lambda.class;
        Method[] methods = cl1.getDeclaredMethods();
        for (Method method : methods) {
            System.out.println(method);
        }
        System.out.println("----------------------");
        for (Method method : cl1.getMethods()) {
            System.out.println(method);
        }
    }
}

class Lambda {
    public void lambda1() {
        System.out.println("lambda1 test method");
    }

    public void lambda2() {
        Runnable lambda2 = () -> System.out.println("lambda2 test method");
        lambda2.run();·
    }
}
~~~

结果：
~~~text
public void com.xiamo.wowmsbackend.Lambda.lambda2()
private static void com.xiamo.wowmsbackend.Lambda.lambda$lambda2$0()
public void com.xiamo.wowmsbackend.Lambda.lambda1()
----------------------
public void com.xiamo.wowmsbackend.Lambda.lambda2()
public void com.xiamo.wowmsbackend.Lambda.lambda1()
public final void java.lang.Object.wait(long,int) throws java.lang.InterruptedException
public final void java.lang.Object.wait() throws java.lang.InterruptedException
public final native void java.lang.Object.wait(long) throws java.lang.InterruptedException
public boolean java.lang.Object.equals(java.lang.Object)
public java.lang.String java.lang.Object.toString()
public native int java.lang.Object.hashCode()
public final native java.lang.Class java.lang.Object.getClass()
public final native void java.lang.Object.notify()
public final native void java.lang.Object.notifyAll()

进程已结束,退出代码0
~~~

可以看出 lambda 是这个类的私有静态方法。（至少编译成 class 之后，是这样的

详细的反编译结果可以看这篇文章：
[深入底层原理—带你看透Lambda表达式的本质](https://blog.csdn.net/weixin_57907028/article/details/117367380)

## END

反射很好用，但也要注意。做一些判断只拿需要的。
lambda 很好用，已经离不开了。（包括 stream 流
