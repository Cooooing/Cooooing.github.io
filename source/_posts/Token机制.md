---
title: Token机制
date: 2023-09-04 16:32:08
categories:
- 学习笔记
tags:
- token
- cookie
- session
- 单点登录
- JWT
---

## Token 是什么

token 是令牌，是服务器生成的一串**用于标记用户的字符串**。
每次请求时携带，让服务器知道请求是哪个用户发出的。（有状态的请求）


### Web 1.0

早期的网站大多是展示自己的内容，以期望更多人可以看到。
类似于报社，博客之类的。并不在意用户是谁。

内容由平台创造、控制、所有，最后获利的也是平台。

### Web 2.0

后来的网站，比如现在。大部分都需要登录才能使用，网站需要知道用户是谁，以提供更加个性化的服务或者广告投放。
比如电商网站、视频网站。

内容由用户创造、但归平台控制和所有。收益也是平台所有。
收益的分配权在平台手中。

### Web 3.0

大概就是区块链所畅想的世界。
内容由用户创造、归用户所有、由用户控制。并和平台协议分配利益。

更多可以参考：[一文读懂"什么是 Web 3.0 ？"](https://zhuanlan.zhihu.com/p/451172211)
关于 web3 了解不深，简单介绍。可能最主要的就是内容，或者说利益的归属权。
下面回过去谈 token。

## 和 token 目的相似的 session

session 是会话。在服务端保存了用户信息，用来区分请求是属于哪个用户的。
session 是基于 cookie 实现的，他会在请求后携带一个 cookie JSESSIONID。
也是一个用于标记用户的字符串。浏览器每次请求都会带上 cookie。
所以和 token 基本一样。那么使用 token 的意义是什么？

1. 首先不同的浏览器对 cookie 是有不同的限制的，比如数量和大小上。
2. 其次就是，用户信息都存储在服务端的 session 中，用户量大的话，对服务器的压力也会大起来。
那么为什么 token 同样是标记用户的字符串，不会有这个问题呢？
因为 token 这个字符串是将用户信息进行加密所得到的字符串。服务端并不存储。
有加密就有解密，所以 **token 中不要写入敏感信息**。
3. 最后，cookie 是存在跨域等问题的。而 token 可以写在请求头、请求体，甚至是 url 路径中传给服务端。简单点说，就是使用更加自由。

另外，用户信息存在 token 中，还有个优点就是在分布式系统中，不需要同步用户信息。
使用 session 的分布式系统往往需要考虑 session 的共享问题。之前写过一篇 spring session 的笔记，有一些 session 共享的方案。

当然，token 也有缺点。那就是 token 一点生成，那么久无法撤销。
因为**服务端是不会任何存用户信息的，所以的用户信息都由 token 解密而来。** 将过期时间写入 token 基本是必须的。
服务端基本也只能通过这个判断 token 是否还有效。无法说在有效期内让这个 token 无效。（至少我没想到好方法。
当然，如果在服务端存个标识。再判断是否有效。那么基本也就回到 session 了。没必要使用 token。

## JWT

JWT 全称 JSON Web Token。
是一个开放标准(rfc7519)，它定义了一种紧凑的、自包含的方式，用于在各方之间以 JSON 对象安全地传输信息。此信息可以验证和信任，因为它是数字签名的。
JWT 可以使用密钥〈使用 HMAC 算法）或使用 RSA 或 ECDSA 的公钥/私钥对进行签名。

JWT 生成的 token 由三部分组成：
1. 标头（Header）
2. 有效载荷（Payload）
3. 签名（Signature）

更详细的介绍：[深入浅出之JWT(JSON Web Token)](https://zhuanlan.zhihu.com/p/355160217)
下面是 JWT 的使用示例代码

### maven 依赖

~~~xml
        <dependency>
            <groupId>com.auth0</groupId>
            <artifactId>java-jwt</artifactId>
            <version>4.4.0</version>
        </dependency>
~~~

### 使用

~~~java
public class JWTUtil {
    
    // 密钥
    private String secret;
    
    /**
     * 创建 token
     */    
    public String createToken(User user) {
        return JWT.create()
                .withExpiresAt(Instant.ofEpochMilli(System.currentTimeMillis() + 30 * 60 * 60 * 1000))  // 设置过期时间 30分钟
                .withAudience(user.getUsername()) // 设置用户信息。可以放很多，但不要放敏感信息
                .sign(Algorithm.HMAC256(secret)); // 指定签名算法
    }

    /**
     * 解析 token
     */
    public User decodeToken(String token) {
        String username;
        try {
            username = JWT.decode(token).getAudience().get(0);
            JWTVerifier jwtVerifier = JWT.require(Algorithm.HMAC256(secret)).build();
            jwtVerifier.verify(token);
        } catch (JWTDecodeException e) {
            e.printStackTrace();
            return null;
        }
        return new User().setUsername(username);
    }
}
~~~

## 多设备登录与单设备登录

多设备登录，将每次登录都视为一个新用户即可。给他发放新的 token。

单设备登录，需要记录用于区分用户设备的标识。实现登出功能，并让其余设备登出即可。

使用 token 实现单设备登录的话，有些违背它的设计。使用 session 或许会更方便。
因为单纯使用 token 是没办法实现登出功能的。

## 单点登录 Single Sign On（简称SSO）

单点登录，指在多系统应用群中登录一个系统，便可在其他所有系统中得到授权而无需再次登录，包括单点登录与单点注销两部分。
[什么是单点登录（SSO）](https://zhuanlan.zhihu.com/p/66037342)


实现单点登录，就需要多个系统共享用户信息。
用户在系统A上登录了，系统A获取到的用户信息需要同步给系统B、系统C... 以达到用户访问系统B的时候，不需要再次登录。

使用 session 的话，就是 session 同步的问题。
1. 使用 tomcat 集群 session 全局复制。每个 tomcat 里的 session 会完全同步。比较影响性能。
2. 将请求的 ip 进行哈希映射到对应的机器。就是同一用户的多次请求都请求的同一个服务器。只需要简单的配置，不要用额外的中间件。但他绕过了问题，并没有解决。
3. 使用中间件，比如 redis 存储 session。然后多服务器共享。

使用 token 的话。就不需要那么麻烦了。
因为用户信息就在 token 中。

从单点登录的功能来看，token 的设计还是很巧妙的。不用额外中间件，不是很浪费性能，系统设计上也不会特别复杂。
但是单纯使用 token，没法注销。有得必有失嘛

更多的多系统设计可能会将登录单独做成一个系统。由它进行 session 的共享，或者 token 的签发。

## token 的续期

其实 token 没有续期，严格来说，是给一个全新的 token。

token 的有效期一般比较短，在小时级别。
用户的在使用的过程中，token 过期了，需要重新登陆，体验上是比较差的。
所以 token 的续期也是比较需要的功能。

在单应用中，token 续期的实现可以在 token 验证时判断下剩余时间。小于一定值（半小时、一小时...）就生成新 token 加在响应里返回。当然需要前端的配合。
当然生成次数需要做限制，不然 token 泄露之后，就可以无限访问了。

在多应用中，上述的方式也是可以的。但使用两个 token 去实现会更好一些。
access_token、refresh_token。用于访问的 token 和用于刷新访问 token 的刷新 token。
access_token 有效期比较短（小时级别）。refresh_token 比较长（一周或者一个月等）。
access_token 每次请求都会携带。当他过期时，前端需要使用 refresh_token 去获取一个新的 access_token。

那么，它好在哪呢。

更加安全？一开始我不是这么认为的。因为 token 有泄露的可能性，那么不管是 access_token 还是 refresh_token 都会泄露。
但是，refresh_token 中可以存储 ip、设备标识等信息。与数据库中持久化的信息进行对比。因为 refresh_token 并不会在请求中频繁携带。更加复杂的验证也是可以接受的。
即使泄露出去，也可以通过额外的信息使之失效。

另一个用处可能是在开放平台。
比如微信开放平台，有非常多的第三方小程序。用户从微信打开小程序进行使用时，经过用户授权，给小程序签发 access_token 和 refresh_token。
小程序服务端存放 refresh_token，小程序客户端存放 access_token。
用户使用过程中，不会出现 access_token 过期的情况。短期内再次使用也不需要重新授权。
微信能通过 refresh_token 知道哪个用户使用了哪个小程序。
小程序能获取用户信息，同时也不会知道用户密码之类的敏感信息。

## END

这个回答很好：[为什么使用双 token 的回答](https://www.zhihu.com/question/506320859/answer/2913865016)
其实单 token 和 session 没啥区别。单系统确实是这样，多系统的话，省去了 session 同步，但也有代价。
用处最大的地方，应该就是开放平台。出于对第三方客户端和链路安全的不信任而设计使用双 token。

这个世界没那么多复杂需求。哪个合适用哪个。
点名批评我自己关于墨夏的出入库系统的设计。







