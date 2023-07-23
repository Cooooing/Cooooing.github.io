---
title: Cookie的SameSite跨站限制
date: 2023-07-23 15:01:37
tags:
- cookie
- 跨域
- 跨站
- CSRF攻击
- nginx
- 反向代理
categories:
- 编程记录
---

## 场景

一个前端vue，后端springboot的项目部署在服务器上。
此时，想编写dockerfile，将他们放在docker中再部署。方便部署到其他地方。

编写完vue的dockerfile后，运行。然后访问。
发现每次请求的sessionId都不一样。（已经不知道多少次出现这个现象了，肯定是跨域的问题
然后排错，发现 `Set-Cookie` 响应头的值后面有个黄色的警告：`此Set-Cookie标头未指定“SameSite“属性，它默认为”SameSite=Lax“，必须为此SetCookie设置“SameSite=None“才能实现跨站点使用`

于是去查了 SameSite 属性

## SameSite 属性

[微软文档 SameSite cookie 属性](https://learn.microsoft.com/zh-cn/microsoftteams/platform/resources/samesite-cookie-update)

cookies 机制一直被认为是不安全的。
SameSite 属性是谷歌浏览器为完善 cookies 安全机制出的特性之一。
Chrome 80 于 2020 年 2 月发布，引入了新的 Cookie 值 SameSite，并默认实施 Cookie 策略。 
SameSite 属性有三个可选值 **Strict、Lax 或 None**。 如果未指定，则 Cookie SameSite 属性**默认采用值 SameSite=Lax**。
ameSite 属性用来限制第三方 Cookie的行为。

| 设置	    | 强制执行                                                                                             | 	值                   | 	属性规范                                      |
|--------|--------------------------------------------------------------------------------------------------|----------------------|--------------------------------------------|
| Lax	   | 大多数情况也不发送第三方Cookie，但是导航到目标站点的**Get请求、预加载（link标签）和链接（a标签）除外**。                                    | Default	             | Set-Cookie:key=value;SameSite=Lax          |
| Strict | **完全禁止第三方Cookie**，当当前站点与请求目标站点是跨站关系时，总是不会发送Cookie。换言之，只有当前站点与请求目标站点是同站关系时，才会带上Cookie。            | 可选                   | 	Set-Cookie:key=value;SameSite=Strict      |
| None   | 	允许第三方Cookie，始终发送。站点选择显式关闭SameSite属性时，在将其值设为None的同时。必须同时设置Secure属性（表示Cookie只能通过HTTPS协议发送），否则无效。	 | 可选，但如果设置，则需要HTTPS协议。 | 	Set-Cookie:key=value;SameSite=None;Secure |

默认值为 Lax，基本只有只读请求（资源请求和Get，不会改变服务器资源）会携带 Cookie。其他POST（会执行数据库 insert、update和delete）的请求不会携带 Cookie
更加详细地，关于 http 和 https 等情况 Cookie 的携带情况可以参考下面这篇博客园的文章

[Cookies的SameSite属性](https://www.cnblogs.com/weixsun/p/14676371.html)

> 这里有一个注意点，跨域和跨站的区别：
> 源是 协议、主机名、端口 的组合，同源要求三者完全相同。
> 一般的同站域名相同即可，但也有同协议同站，因为考虑到攻击者会利用不安全的http发起CSRF攻击一个https安全站点。
> 详细参考：[讲清楚同源、跨源、同站、跨站](https://zhuanlan.zhihu.com/p/459648859)

## 问题的解决方案

知道 SameSite 属性有什么作用之后，也就知道了上面遇到问题的原因：

前端项目放在 docker 中，docker 跑在本地，浏览器访问本地 127.0.0.1
后端服务跑在服务器，浏览器访问公网ip
这肯定是跨站的，由于所使用的浏览器比较新，Cookie 的 SameSite 属性默认值为 Laz，所以不会携带 Cookie。
后端服务会认为这些请求都是新用户发起，因为没有获得 SessionId ，所以每次都会新建一个 Session，并将 SessionId 设置进 cookie 中。

而部署在同一个服务器上的前端项目则不会有这个问题。因为是同站的。

也没有什么好的解决方案，因为我的服务器没有配置域名，所以没有是用不了 https 协议。以至于无法设置 SameSite 属性为 None。
因为是在开发测试阶段，所以影响不大。使用低版本的浏览器访问或许可以。

然后就是查阅的博客和资料中都提到了 CSRF攻击，后面记录下。

另外，有个问题：
前后端服务部署在同一个服务器上不会有问题，但是部署到不同服务器...
那不就是我现在遇到问题的情况吗，首先想到的解决办法就是 nginx 的反向代理。
后面去验证下。

## CSRF攻击

[什么是CSRF？如何防御CSRF攻击？](https://zhuanlan.zhihu.com/p/343515825)
[前端 | CSRF 的攻击类型与防御](https://zhuanlan.zhihu.com/p/61827277)
[【基本功】 前端安全系列之二：如何防止CSRF攻击？](https://mp.weixin.qq.com/s?__biz=MjM5NjQ5MTI5OA==&mid=2651748960&idx=3&sn=93b468b875ee1e2d72c0a0c3464831a3)

CSRF（Cross-Site Request Forgery），也被称为 one-click attack 或者 session riding，即跨站请求伪造攻击。是一种劫持受信任用户向服务器发送非预期请求的攻击方式。
攻击者诱导受害者进入第三方网站，在第三方网站中，向被攻击网站发送跨站请求。利用受害者在被攻击网站已经获取的注册凭证，绕过后台的用户验证，达到冒充用户对被攻击的网站执行某项操作的目的。

简单来说，就是用户持有网站A验证过的 Cookie，有进行相关的请求的权限。
此时，该用户访问了网站B，那B就可以向A发送跨站请求。浏览器会将这些请求加上有效的 Cookie，B就达到可以对A执行某些操作的目的。

**CSRF 利用的是网站对用户网页浏览器的信任。**

所以 SameSite 属性限制了 跨站请求 Cookie 的携带。一定程度上可以防止 CSRF 攻击。

## nginx 反向代理

vue 中将所有请求加上前缀
~~~js
import axios from 'axios';

const app = axios.create({
    baseURL: '/api',
    timeout: 10000,
});

export default app;
~~~

这时，vue 中所有 axios 请求都会请求 ip:host/api/真实后端请求

然后，在 nginx 中配置反向代理
~~~nginx configuration
server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }
  
    # 代理后端API的配置
    location /api/ { # 用于转发的路径标记
        proxy_pass http://124.222.100.205:8080/; # 被代理的API地址
    }
}
~~~

这时，前端所有请求都是同源的。不会有任何的跨域问题。（至少我认为不会有
静态资源的请求 nginx 会处理并返回
动态资源的请求 nginx 会转发
浏览器完全感觉不到后端的存在，即便是查看请求信息。（**可以隐藏真实的服务端**

## 其他参考

[深入理解 Cookie 的 SameSite 属性](https://juejin.cn/post/6963632513914765320)
[Feature: Cookies default to SameSite=Lax](https://chromestatus.com/feature/5088147346030592)
[当浏览器全面禁用三方 Cookie](https://zhuanlan.zhihu.com/p/131256002)
[完美解决Chrome Cookie SameSite跨站限制](https://juejin.cn/post/7073447264756170765)
[cookie session都过时了，现在是HTML5时代](https://blog.csdn.net/goodykz/article/details/83891418)
