---
layout: post
title: private 方法使用 AOP 导致注入属性为 null 的问题
date: 2024-02-04 19:41:36
categories:
- 编程记录
tags:
- aop
- spring
- 动态代理
- cglib
---

## 问题描述

项目中使用 aop 实现多数据源切换，如下：

自定义注解：
~~~java
@Target({ElementType.METHOD, ElementType.TYPE, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DataSource {
    String value() default "primary";
}
~~~

aop 方法：
~~~java
@Aspect
@Configuration
@Slf4j
public class DataSourceAspect {

    @Before("@annotation(dataSource)")
    public void switchDataSource(JoinPoint point, DataSource dataSource) {
        String value = dataSource.value();
        // 切换数据源
        DynamicDataSourceService.switchDb(value);
    }

    @After("@annotation(dataSource)")
    public void restDataSource(JoinPoint point, DataSource dataSource) {
        // 重置数据源
        DynamicDataSourceService.resetDb();
    }
}
~~~

使用：
~~~java
@RestController
@RequiredArgsConstructor
@RequestMapping("/test")
public class TestController {

    private final TestService service;
    
    @PostMapping("/select")
    @DataSource("db2")
    public Result<List<Object>> selectCity() {
        List<Object> res = service.selectAll();
        return Result.success(res);
    }
}
~~~

具体切换方法省略。

问题代码：
~~~java
@RestController
@RequiredArgsConstructor
@RequestMapping("/test")
public class TestController {

    private final TestService service;
    
    @PostMapping("/select")
    @DataSource("db2")
    private Result<List<Object>> selectCity() {
        List<Object> res = service.selectAll();
        return Result.success(res);
    }
}
~~~

报错：
`java.lang.NullPointerException
        at com.example.controller.TestController.select(TestController.java:48)`

## 问题分析

先定义两个方法，一个 public 一个 private，比较区别。

~~~java
@RestController
@RequiredArgsConstructor
@RequestMapping("/test")
public class TestController {

    private final TestService service;

    @PostConstruct
    public void init() {
        log.info("service bean:" + service);
    }

    @PostMapping("/selectPublic")
    @DataSource("db2")
    public Result<List<Object>> selectPublic() {
        List<Object> res = service.selectAll();
        return Result.success(res);
    }

    @PostMapping("/selectPrivate")
    @DataSource("db2")
    private Result<List<Object>> selectPrivate() {
        List<Object> res = service.selectAll();
        return Result.success(res);
    }
}
~~~

启动后，日志：
`2024-02-04 20:06:26,704 INFO [main] com.example.controller.TestController -> service bean:com.example.service.impl.TestServiceImpl@710ae6a7`

说明 bean 是被正常注入进 spring 容器中的。
调用 selectPublic 是可以正常返回的，注入也是正常。
调用 selectPrivate 则会报错：`java.lang.NullPointerException`，service 没有成功注入。
> 这里的 private 方法是被 AOP 拦截的。普通的 private 方法，如果没有 AOP，bean 的注入是正常的，不会出现 NPE 报错。

在 org.springframework.web.method.support 中 InvocableHandlerMethod 类的 doInvoke 方法上打断点。
可以发现，不管是 public 方法还是 private 方法， cglib 创建的代理类中，service 属性为 null。
![public代理类service属性.png](https://cooooing.github.io/images/private方法使用AOP导致注入属性为null的问题/public代理类service属性.png)
![private代理类service属性.png](https://cooooing.github.io/images/private方法使用AOP导致注入属性为null的问题/private代理类service属性.png)

但是，当在 AOP 的拦截方法上打断点，可以发现，public 方法是可以停在断点上的，但 private 方法则直接结束，并没有执行 AOP 的方法。
**所以 private 方法是没有被 AOP 所拦截的。会继续使用代理类，而代理类中的 service 并没有注入，是 null 。从而导致 NPE 报错。**

那么，为什么 public 没有报错呢？想必 AOP 中做了些处理，注入了所需要的 bean。

org.springframework.aop.framework 的 CglibAopProxy 类中有个内部类 CglibMethodInvocation 如下：
~~~java
    private static class CglibMethodInvocation extends ReflectiveMethodInvocation {
        @Nullable
        private final MethodProxy methodProxy;

        public CglibMethodInvocation(Object proxy, @Nullable Object target, Method method, Object[] arguments, @Nullable Class<?> targetClass, List<Object> interceptorsAndDynamicMethodMatchers, MethodProxy methodProxy) {
            super(proxy, target, method, arguments, targetClass, interceptorsAndDynamicMethodMatchers);
            this.methodProxy = Modifier.isPublic(method.getModifiers()) && method.getDeclaringClass() != Object.class && !AopUtils.isEqualsMethod(method) && !AopUtils.isHashCodeMethod(method) && !AopUtils.isToStringMethod(method) ? methodProxy : null;
        }

        @Nullable
        public Object proceed() throws Throwable {
            try {
                return super.proceed();
            } catch (RuntimeException var2) {
                throw var2;
            } catch (Exception var3) {
                if (!ReflectionUtils.declaresException(this.getMethod(), var3.getClass()) && !KotlinDetector.isKotlinType(this.getMethod().getDeclaringClass())) {
                    throw new UndeclaredThrowableException(var3);
                } else {
                    throw var3;
                }
            }
        }

        protected Object invokeJoinpoint() throws Throwable {
            return this.methodProxy != null ? this.methodProxy.invoke(this.target, this.arguments) : super.invokeJoinpoint();
        }
    }
~~~

bean 就是在这个代理类中进行注入的。
public 方法执行 invoke(this.target, this.arguments)
protected 方法执行 super.invokeJoinpoint()

CglibAopProxy 下执行的时候，上面无论哪个方法都会用实际对象来进行反射调用。
而实际对象的 bean 属性值在 spring 启动时便已经注入了。因此代理对象会被重新赋值，即：用实际对象来代替原有的代理对象。
> super.invokeJoinpoint() 方法主要调用了 method.setAccessible(true); 取消 Java 语言访问检查。


## 总结

private 方法并没有被真正的代理类拦截。
虽然代理类 InvocableHandlerMethod 中 private 方法执行了 doInvoke，但是并没有被 CglibAopProxy 拦截。
因此 private 方法无法获取被代理目标对象，也就无法获取注入的bean属性。

## 解决方法

1. 把 private 方法改为 public 方法。（不要粗心写错了，指我自己）
2. 从 ApplicationContext 上下文中直接获取 bean。

## 参考

[Java 在Controller层 private修饰的方法导致Service注入为空](https://juejin.cn/post/6910215219822362632)
[这一次搞懂Spring代理创建及AOP链式调用过程](https://cloud.tencent.com/developer/article/1692917)
[为什么你写的Controller里，private方法中的bean=null？](https://blog.csdn.net/q258523454/article/details/118118553)