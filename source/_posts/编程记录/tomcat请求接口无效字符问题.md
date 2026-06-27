---
layout: post
title: tomcat请求接口无效字符问题
date: 2023-01-17 17:59:41
categories:
  - 编程记录
tags:
  - Tomcat
  - HTTP
  - 问题排查
---

## 场景

环境：SpringBoot(2.6.11)内置tomcat(9.0.65)

在**Get请求**中含有特殊字符{}时报错，实际场景是请求参数为json格式的数据。

~~~text
java.lang.IllegalArgumentException: Invalid character found in the request target [/test/test?id={} ]. The valid characters are defined in RFC 7230 and RFC 3986
~~~

## 原因

Tomcat 8.0 以上版本加强了对请求目标的校验。URL 中可以直接出现的字符主要包括：

* 英文字母(a-zA-Z)
* 数字(0-9)
* -_.~四个特殊字符
* 保留字符( ! * ’ ( ) ; : @ & = + $ , / ? # [ ] )

`{}` 不属于可以直接出现在 URI 中的字符，放在查询参数里也应该先做 URL 编码。

## 解决方案

### 降低tomcat版本（不建议）

降低版本至7.0.76之前。
> 逃避不是办法，要直面问题。

### 添加关于tomcat的配置类

~~~java
@Configuration
public class TomcatConfig {

    @Bean
    public TomcatServletWebServerFactory webServerFactory() {
        TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
        factory.addConnectorCustomizers((Connector connector) -> {
                connector.setProperty("relaxedPathChars", "\"<>[\\]^`{|}");
                connector.setProperty("relaxedQueryChars", "\"<>[\\]^`{|}");
        });
        return factory;
    }
}
~~~

这种方式只是让 Tomcat 接受这些原始字符，不能替代客户端对参数做 URL 编码。

### 使用post请求方式(建议)

将参数写入请求体内，而不是url。

出现这个问题的原因是我虽然使用的是post请求，但是参数是没有写在请求体中，而是和get请求一样写在url中。
