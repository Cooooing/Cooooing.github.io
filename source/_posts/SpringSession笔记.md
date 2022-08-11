---
title: SpringSession笔记
date: 2022-08-08 13:54:27
tags:
- spring
- session
categories:
- 笔记
---

## Session会话管理

### session与cookie

session：  
因为http协议是无状态的，所以一次会话结束后，下次再会话时，服务端并不知道是上次这个人，所以服务端需要记录用户的状态时，需要session机制来识别具体的用户。

cookie：
每次http请求时，客户端都会发送相应的cookie信息。  
大多数应用都是使用cookie来实现session跟踪的。即第一次创建session时，服务端在http协议中向客户端cookie中记录一个sessionID，以后每次请求会把这个会话id发送到服务端，这样服务端可以识别用户。

如果cookie被禁用了，可以重写url，即将sessionID写到url中实现参数传递。（不过一般不会这么做

Session机制存放过程：
每次请求浏览器都会将Cookie数据传给Tomcat
每次服务器响应请求都会携带一个Cookie数据，将SessionId写入浏览器（已有则会覆盖。 
* tomcat接受用户请求后，会从cookie中寻找name为sessionid的数据。
    * 如果Cookie中没有，则服务器需要创建一个新的Session对象及sessionid。
    * 如果有，则tomcat会获取这个数据，然后在Session容器中，根据sessionid获取数据。
        * 数据存在，表示这个session有效
        * 数据不存在，则表示这个session已经过期。tomcat会创建一个新的session及sessionid，记录并写入浏览器。

### 集群后，session丢失的原因：

多台tomcat之间无法共享session。
tomcat容器关闭或重启，也会导致session会话失效。

### session会话共享方案

1. 使用容器扩展插件来实现，比如就tomcat的tomcat-redis-session-manager插件，基于jetty的jetty-session-redis插件、memcatched-session-manager插件；
    好处：无需改动代码
    坏处：过于依赖容器，容器升级或更换，需要重新配置。底层是复制session到其他服务器，会有一定延迟，不能部署太多服务器。
2. 使用Nginx负载均衡的ip hash策略，实现用户每次访问都绑定到同一tomcat服务器，实现session总是存在。
    局限性：ip不可变。其次，负载均衡时，如果某个服务器发生故障，会重新定位，也会跳到别的服务器。
3. 自己写一套session会话管理工具类。
    比较灵活，但开发需要一些额外时间，同时功能可能较弱。（不要重复造轮子
4. 使用框架的会话管理工具，SpringSession。
    不依赖容器，不惜要改代码。较为完美的方案
    
## SpringSession简介

SpringSession是Spring家族中的一个子项目，提供了一组Api和实现，用于管理用户Session信息。
它将servlet容器实现的httpSession替换为spring-session，专注于解决session管理问题，Session信息存储在Redis中，可简单快速且无缝的集成到应用中。

SpringSession特性：
1. 提供用户session管理的api和实现
2. 提供HttpSession，以中立的方式取代web容器中的session
3. 支持集群的session处理，不必绑定到具体的web容器去解决集群下的session共享问题

SpringSession redis依赖
~~~xml
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-data-redis</artifactId>
</dependency>
~~~

然后，配置好redis。用户的session信息就会存储在redis中实现共享。

## SpringSession的实现原理

大概的实现原理

1. 自定义Filter，实现doFilter方法
2. 集成HttpServletRequestWrapper、HttpServletResponseWrapper类，重写getSession等相关的方法，在这些方法中调用session存储容器的操作类。比如redis等
3. 在1中的doFilter里，new 2中自定义的request和response类，将他们分别传递到过滤器链上
4. 将这个过滤器配置到过滤器链的第一个位置上

## 结尾

以后深入了，应该会有补充。比如使用场景之类的
目前经验不足，就写到这吧。