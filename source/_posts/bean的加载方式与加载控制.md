---
title: bean的加载方式与加载控制
date: 2023-04-07 15:28:18
tags:
- spring
- java
categories:
- 学习笔记
---

## bean 加载方式

### XML 方式声明 bean

~~~xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:schemaLocation="http://www.springframework.org/schema/beans
       http://www.springframework.org/schema/beans/spring-beans.xsd">

    <!--声明自定义 bean-->
    <bean id="bookService"
          class="com.example.demo.service.impl.BookServiceImpl"
          scope="singleton"/>
    <!--声明第三方 bean-->
    <bean id="dataSource" class="com.alibaba.druid.pool.DruidDataSource"/>
</beans>
~~~

### XML 和 注解 声明 bean

xml 配置很繁琐，所以提供了 注解 的声明方式。
但依然要在 xml 文件中告诉 spring 需要扫描的包。即去哪里找到被注解声明的 bean

~~~xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:context="http://www.springframework.org/schema/context"
       xsi:schemaLocation="http://www.springframework.org/schema/beans
       http://www.springframework.org/schema/beans/spring-beans.xsd
       http://www.springframework.org/schema/context
       http://www.springframework.org/schema/context/spring-context.xsd">
    <!--配置扫描的包，去扫描包中的加了注解需要声明 bean-->
    <context:component-scan base-package="com.example.demo"/>
</beans>
~~~

~~~java
@Configuration
public class DataSourceConfig{
    @Bean
    public DruidDataSource getDataSource(){
        DruidDataSource dataSource = new DruidDataSource();
        // 在这里做其余的配置，比如这个 bean 对象需要的属性（这里是数据源等信息） 等等..
        return dataSource;
    }
}
~~~

**使用 @Component 及其衍生注解 @Controller、@Service、@Repository 定义 bean**
**使用 @Bean 定义第三方 bean，并将其所在类定义为配置类或 bean。（一般使用 @Configuration 将其定义为配置类）**

### 注解方式声明配置类

既然可以用注解声明 bean，那么配置信息也可以用注解声明。
就可以彻底舍弃掉 xml 文件了。

~~~java
@ComponentScan({"com.example.demo"})
public class SpringConfig{
    @Bean
    public DruidDataSource getDataSource(){
        DruidDataSource dataSource = new DruidDataSource();
        // 在这里做其余的配置，比如这个 bean 对象需要的属性（这里是数据源等信息） 等等..
        // ...
        return dataSource;
    }
}
~~~

@Configuration 配置项如果不用于被扫描可以省略

### 拓展1：FactoryBean

初始化实现 FactoryBean 接口的类，可以实现对 bean 加载到容器之前的批处理操作。
从名字可以看出是工厂模式

~~~java
public class BookFactoryBean implements FactoryBean<Book> {
    @Override
    public Book getObject() throws Exception {
        Book book = new Book();
        // 各种相关的初始化操作
        // ...
        return book;
    }

    // 获取 bean 的类型
    @Override
    public Class<?> getObjectType() {
        return Book.class;
    }

    // 是否为单例模式（默认都为单例）
    /* 
    多例模式即 每次向 spring 容器获取这个 bean 时，都会初始化(new)一个新的返回。
    此时 spring 容器只管创建不管销毁。而单例模式，spring 掌握 bean 的整个生命周期
     */
    @Override
    public boolean isSingleton() {
        return FactoryBean.super.isSingleton();
    }
}
~~~

有了上面的实现 factorybean 接口之后的工厂类，再使用 @Bean 进行加载时。
会调用 工厂类 的 getObject() 方法创建 bean

~~~java

@Configuration
public class SpringConfig {
    @Bean
    public BookFactoryBean book() {
        BookFactoryBean bookFactoryBean = new BookFactoryBean();
        // 配置需要的参数等..
        // ...
        return bookFactoryBean;
    }
}
~~~

### 拓展2：proxyBeanMethod 属性

proxyBeanMethod 是 @Configuration 注解中的属性。默认值为 true
这个属性决定了该配置类是否被代理。（spring 使用基于继承的 cglib 动态代理 和 基于接口的 jdk 动态代理 两种代理方式）

为 true 时，配置类会被 cglib 代理增强。生成代理对象，放入 spring 容器。
此时，**bean 是单例的**。@Bean 调用生成实例时，如果容器中已经存在这个 bean，就会直接返回。
被称为 Full 模式

为 false 时，每次获取 bean 都会生成新的 bean 对象。（多例
被称为 Lite 模式

### @Import 加载 bean

使用 @Import 注解导入需要注入的 bean 对应的字节码
@Import 加载的 bean 名称为 全路径类名。比如 `com.example.demo.Book`
**导入 配置类，配置类及类里声明的 bean 都会被加载**

~~~java
@Import(Book.class)
public class SpringConfig{
}
~~~

被导入的 bean 无需注解声明
~~~java
public class Book{
}
~~~

**无侵入式编程**
降低了代码与 spring 的耦合。使用较多

### 在上下文对象在容器中初始化完毕后手动注入 bean

~~~java
public class Main {
    public static void main(String[] args) {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(SpringConfig.class);
        context.register(Book.class);
        // 指定 bean 名称
        context.registerBean("javaBook", Book.class);
    }
}
~~~

### @Import 导入 ImportSelector 接口，实现对导入源的编程式处理

框架中会大量使用。

~~~java
public class TestImportSelector implements ImportSelector {
    @Override
    public String[] selectImports(AnnotationMetadata importingClassMetadata) {
        /*
        方法参数 importingClassMetadata 为导入类的元数据
        可以获取导入各种信息及状态，从而可以对 bean 的加载进行控制等操作
         */
        boolean b = importingClassMetadata.hasAnnotation("org.springframework.context.annotation.Configuration");
        if (b){
            return new String[]{"com.example.demo.Book"};
        }
        return new String[0];
    }
}
~~~

### @Import 导入 ImportBeanDefinitionRegistrar 接口，实现对导入源的编程式处理，及注册

相对于 ImportSelector 的拓展，可以使用 BeanDefinitionRegistry 注册器控制 bean 的注册等。

~~~java
public class TestRegister implements ImportBeanDefinitionRegistrar {
    @Override
    public void registerBeanDefinitions(AnnotationMetadata importingClassMetadata, BeanDefinitionRegistry registry) {
        // 和 ImportSelector 一样，可以获得元数据进行控制
        // ...
        // 通过 BeanDefinition 的注册器注册实名 bean
        AbstractBeanDefinition beanDefinition = BeanDefinitionBuilder.rootBeanDefinition(Book.class).getBeanDefinition();
        registry.registerBeanDefinition("javaBook",beanDefinition);
    }
}
~~~

### @Import 导入 BeanDefinitionRegistryPostProcessor 接口，后置处理

在 bean 定义注册器结束之后，执行 实现方法。最后对容器中的 bean 进行干预。

~~~java
public class TestPostProcessor implements BeanDefinitionRegistryPostProcessor {
    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry beanDefinitionRegistry) throws BeansException {
        // 和 ImportBeanDefinitionRegistrar 使用一样，不过最后执行。（bean 定义注册器完成后
        AbstractBeanDefinition beanDefinition = BeanDefinitionBuilder.rootBeanDefinition(Book.class).getBeanDefinition();
        beanDefinitionRegistry.registerBeanDefinition("javaBook",beanDefinition);
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory configurableListableBeanFactory) throws BeansException {

    }
}
~~~

## bean 的加载控制

### 编程式 控制 bean 加载

上面 bean 的加载方式中，最后四种都可以在代码中对 bean 的加载加以控制。（加一些条件
其他的则不行，写了便加载进去。无法加以条件的控制

### 注解式 控制 bean 加载

@Conditional 注解是 spring 提供的。可以帮助我们实现 bean 的加载控制。
但他需要我们传一个 Condition 类型的参数。
Condition 是一个接口，需要我们自己实现 matches 方法，实现规则以控制 bean 的加载。

springboot 提供了很多 Condition 的实现，大多以 ConditionalOn 开头，也有叫 Profile 的（区分加载环境等）。
使用 @ConditionalOn*** 注解为 bean 的加载设置条件。

比如下面的用法：在有 `com.example.demo.Java` 这个类的情况下，才加载 Book 这个 bean。
~~~java
@Configuration
public class SpringConfig {
    @Bean
    @ConditionalOnClass(name = "com.example.demo.Java")
    public Book getBook(){
        return new Book();
    }
}
~~~

类似的还有 @ConditionalOnMissingClass、@ConditionalOnWebApplication、@ConditionalOnBean 等等注解，以实现不同的条件控制。

## bean 依赖属性的配置

实现约定大于配置的一种方式吧。
当配置属性时，使用配置文件中的属性。否则，使用默认值（即约定

实现方式：

基础类：
~~~java
@Data
public class Cat {
    private String name;
    private Integer age;
}
~~~

~~~java
@Data
public class Mouse {
    private String name;
    private Integer age;
}
~~~

配置文件加载类：
使用 @ConfigurationProperties(prefix = "cartoon") 加载配置文件中 cartoon 开头的属性
~~~java
@Data
@ConfigurationProperties(prefix = "cartoon")
public class CartoonProperties {
    private Cat cat;
    private Mouse mouse;
}
~~~

依赖配置文件中属性的 bean：
使用 @EnableConfigurationProperties(CartoonProperties.class) 让配置文件加载类（使用了 @ConfigurationProperties 注解的类）生效
并将其注入到容器中，交由容器进行管理。如果不使用这个注解，则需要使用 @Component 手动注入。
~~~java
@Component
@Data
@EnableConfigurationProperties(CartoonProperties.class)
public class CartoonCatAndMouse {
    private Cat cat;
    private Mouse mouse;

    private CartoonProperties cartoonProperties;

    // 使用构造器注入，其他注入方式也可以
    public CartoonCatAndMouse(CartoonProperties cartoonProperties) {
        this.cartoonProperties = cartoonProperties;
        // 在无参构造中，进行一些条件的判断。以实现配置的内容生效，不配置使用默认值的效果
        cat = new Cat();
        cat.setName(cartoonProperties.getCat() != null && StringUtils.hasText(cartoonProperties.getCat().getName()) ? cartoonProperties.getCat().getName() : "tom");
        cat.setAge(cartoonProperties.getCat() != null && cartoonProperties.getCat().getAge() != null ? cartoonProperties.getCat().getAge() : 5);
        mouse = new Mouse();
        mouse.setName(cartoonProperties.getMouse() != null && StringUtils.hasText(cartoonProperties.getMouse().getName()) ? cartoonProperties.getMouse().getName() : "jerry");
        mouse.setAge(cartoonProperties.getMouse() != null && cartoonProperties.getMouse().getAge() != null ? cartoonProperties.getMouse().getAge() : 3);
    }

    public void play() {
        System.out.println(cat.getAge() + "岁的" + cat.getName() + "和" + mouse.getAge() + "岁的" + mouse.getName() + "打起来了");
    }
}
~~~

配置文件中的内容：
~~~yml
cartoon:
  cat:
    name: 图多盖洛
    age: 3
  mouse:
    name: 泰菲
    age: 1
~~~

## END

原理学习任重道远
