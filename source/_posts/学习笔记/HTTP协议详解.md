---
layout: post
title: HTTP协议详解
date: 2023-02-13 15:55:32
tags:
- HTTP协议
- socket
- 状态码
- URI
categories:
- 学习笔记

---

## HTTP协议介绍

超文本传输协议（英文：HyperText Transfer Protocol，缩写：HTTP）是一种用于分布式、协作式和超媒体信息系统的**应用层协议**，用于如何封装数据。
HTTP是万维网的数据通信的基础，它和TCP/IP协议簇的其他协议一样，也是用于客户端和服务端的通信。

> TCP/UDP 是传输层协议，主要解决数据在网络中的传输。
> IP 是网络层协议，同样解决数据在网络中的传输。

[菜鸟教程-http简介](https://www.runoob.com/http/http-intro.html)

HTTP 是一个客户端终端（用户）和服务器端（网站）**请求和应答**的标准协议。协议，即规定了通信**信息的格式**。
我们通过使用网页浏览器或者其它的工具发起 HTTP 请求，这个客户端为我们称之为用户代理程序（user agent）。
服务器上存储着一些资源，比如 HTML 文件和图像。我们称这个应答服务器为源服务器（origin server）。

通常，由 HTTP 客户端发起一个请求，此时创建一个到服务器指定端口（默认是80端口）的 tcp 连接。
HTTP 服务器则在那个端口监听客户端的请求。一旦收到请求，服务器会向客户端返回一个状态，比如" HTTP/1.1 200 OK"，以及返回的内容，如请求的文件、错误消息、或者其它信息。

> 常见的 HTTP 服务器有 IIS、nginx、apache、tomcat 等。

## HTTP 工作原理

以下是 HTTP 请求/响应的步骤：

1. 客户端连接到 Web 服务器
   浏览器向 DNS 服务器请求解析 URL 中的域名对应的 ip 地址，然后 HTTP 客户端与目标服务器建立一个 tcp 连接。
2. 发送 HTTP 请求
   通过 tcp 连接，客户端向服务器发送一个 HTTP 请求。请求报文包括 **请求行、请求头、空行、请求数据** 四部分组成。
3. 服务器接受请求，处理后返回 HTTP 响应
   服务器 **解析请求、获取资源** ，然后将资源写进响应数据。响应由 **状态行、响应头、空行、响应数据** 四部分组成。
4. 服务器释放 tcp 连接
   若 connection 模式为 close，则服务器主动关闭 tcp 连接，客户端被动关闭连接，释放 tcp 连接。
   若 connection 模式为 keepalive，则该连接会保持一段时间，在该时间内可以继续接收请求。无论如何都会释放。
5. 客户端解析响应
   客户端浏览器首先解析状态行，查看表明请求是否成功的状态代码。
   然后解析每一个响应头，响应头告知以下为若干字节的 HTML 文档和文档的字符集。
   客户端浏览器读取响应数据HTML，根据 HTML 的语法对其进行格式化，并在浏览器窗口中显示。

所以，从上面的过程来看：

1. HTTP 是无连接的：无连接的含义是限制每次连接只处理一个请求，服务器处理完客户的请求，并收到客户的应答后，即断开连接，采用这种方式可以节省传输时间。
2. HTTP 是媒体独立的：只要客户端和服务器知道如何处理的数据内容，任何类型的数据都可以通过HTTP发送，客户端以及服务器指定使用适合的
   MIME-type 内容类型。
3. HTTP 是无状态：HTTP
   协议是无状态协议，无状态是指协议对于事务处理没有记忆能力，缺少状态意味着如果后续处理需要前面的信息，则它必须重传，这样可能导致每次连接传送的数据量增大，另一方面，在服务器不需要先前信息时它的应答就较快。

## HTTP 报文格式

一个完整的HTTP协议的报文主要由以下三个部分组成：

1. 起始行（请求行、响应行）：描述请求或响应的基本信息。
2. 首部字段（请求头、响应头）：使用key-value的形式更加详细的说明报文。
3. 消息正文（请求体、响应体）：实际的传输数据，不一定是文本，也有可能是图片、音频、视频等二进制数据。

因为HTTP协议是基于 TCP/IP 的，所以我们可以写个简单的 socket 程序来获取请求报文。

~~~java
public class HttpSocketTest {
    public static void main(String[] args) throws IOException {
        // 创建 ServerSocket 监听8080端口
        ServerSocket server = new ServerSocket(8000);
        Socket socket = server.accept();
        // 读取请求报文
        InputStream in = socket.getInputStream();
        byte[] bytes = new byte[in.available()];
        int result = in.read(bytes);
        if (result != -1)
            System.out.println(new String(bytes));
        System.out.println();
        // 返回响应报文
        OutputStream out = socket.getOutputStream();
        StringBuffer response = new StringBuffer();
        response.append("HTTP/1.1 200 OK\r\n");
        response.append("Content-type:text/html\r\n\r\n");
        response.append("CurrentTime: ").append(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()));
        System.out.println(response);
        out.write(response.toString().getBytes());
        out.flush();
        out.close();
        in.close();
        socket.close();
        server.close();
    }
}
~~~

使用浏览器访问： http://localhost:8000/ 即可得到请求报文及我们自己构建的响应报文

get 请求报文：

~~~text
GET /test HTTP/1.1
Host: localhost:8000
Connection: keep-alive
...
~~~

post 请求报文

~~~text
POST / HTTP/1.1
Host: localhost:8000
Content-Type: application/json
Connection: keep-alive

{
    "name":"zs"
}
~~~

响应报文：

~~~text
HTTP/1.1 200 OK
Content-type:text/html

CurrentTime: 2023-02-13 18:37:31
~~~

所以，从上面的例子可以得出 http 报文的格式：

请求报文格式：
![请求报文格式](https://cooooing.github.io/images/学习笔记/HTTP协议详解/请求报文格式.png)

响应报文格式：
![响应报文格式](https://cooooing.github.io/images/学习笔记/HTTP协议详解/响应报文格式.png)

## HTTP 请求方法

HTTP1.0定义了三种请求方法： GET, POST 和 HEAD方法。
HTTP/1.1 协议中共定义了八种方法来以不同方式操作指定的资源。
我们目前最常见的有两种一种get，另外一种叫post。这两种方法理论上就足够我们进行所有的资源操作了。
但还是细分下比较好，细分后可以使用 RESTful 风格的 API （在{% post_link SpringBoot笔记 %}中有写过）

首先来列举下这八种请求方法：

| 方法          | 描述                                                                      |
|-------------|-------------------------------------------------------------------------|
| **GET**     | 	请求指定的页面信息，并返回实体主体。                                                     |
| HEAD	       | 类似于 GET 请求，只不过返回的响应中没有具体的内容，用于获取报头                                      |
| **POST**	   | 向指定资源提交数据进行处理请求（例如提交表单或者上传文件）。数据被包含在请求体中。POST 请求可能会导致新的资源的建立和/或已有资源的修改。 |
| **PUT**	    | 从客户端向服务器传送的数据取代指定的文档的内容。                                                |
| **DELETE**	 | 请求服务器删除指定的页面。                                                           |
| CONNECT     | 	HTTP/1.1 协议中预留给能够将连接改为管道方式的代理服务器。                                      |
| OPTIONS     | 	允许客户端查看服务器的性能。                                                         |
| TRACE	      | 回显服务器收到的请求，主要用于测试或诊断。                                                   |
| **PATCH**	  | 是对 PUT 方法的补充，用来对已知资源进行局部更新 。                                            |

> GET 提交的数据会放在 URL 之后，也就是请求行里面，以?分割 URL 和传输数据，参数之间以&相连，如 user?name=zs&id=114514 。POST方法是把提交的数据放在 HTTP 包的请求体中。
> GET 提交的数据大小有限制（因为浏览器对 URL 的长度有限制，比如 IE 的限制是2083个字符，火狐是65536个字符，~~大概~~），而 POST 方法提交的数据没有限制。

## URI

URI（uniform resource identifier），统一资源标识符，用来唯一的标识一个资源。
它包含了 URL 和 URN 的概念，是它们的超集。

URI 的组成：
![URI的组成](https://cooooing.github.io/images/学习笔记/HTTP协议详解/URI的组成.png)

1. Scheme 指的就是方案，比如 HTTP，HTTPS，FTP 等，我们也可以自定义协议，只要服务器支持即可。
   Scheme可以是由 **字母**、**数字**、**+**、**-**、**.** 都是允许的
   > 在Scheme之后，必须使用 :// 把 Scheme 与后面的部分区分开来
2. authority 包含了用户名和密码（user information），还有主机和端口号。
   用户名密码在 URI 中明文传输非常不安全，所以除了 ftp 很少使用。通常只使用 host:port
3. path 为路径 
4. query 为查询参数 为可选参数，以 ? 开头，参数以 & 分隔，再以 = 分开参数名称与数据
5. fragment 为段落 为可选参数 以 # 开头，该标识符为辅助资源提供方向。


URL（uniform resource locator），统一资源定位器，它是一种具体的 URI，即URL可以用来标识一个资源，而且还指明了如何 locate 这个资源。

通过定位来获取资源。所以当目标资源位置发生变化，比如服务器宕机，或者位置变了，URL 就失效了。
举个例子： http://localhost:8080/query?id=114514 来介绍它的格式，基本上是 URI 的简化（省去了部分）

1. 协议：一般为 http 或 https。
2. 主机：通常为域名，有时为 IP 地址。
3. 端口号：以数字方式表示，若为 http 的默认值 :80 可省略，https 的默认值 :443 端口号数字范围为 0~65536。
4. path：以 / 字符区别路径中的每一个目录名称，根路径为 / 。
5. 查询：GET模式的窗体参数，以 ? 开头，参数以 & 分隔，再以 = 分开参数名称与数据，通常以 UTF-8 的 URL 编码，避开字符冲突的问题。


URN（uniform resource name），统一资源命名，是通过名字来标识资源，比如 C4D038B4BED09FDB1471EF51EC3A32CD

根据名字就可以找到对应的资源，相比 URL 的好处就是不论资源位置怎么变，都可以找到。
但这明显是不现实的，因为这样就需要一个解析器去根据名字找到对应资源。
这个解析器相当于 URL 解析域名的根服务器，不过资源与域名相比，不管是类型还是数量，URN的解析器都不太可能实际实现并投入实际使用。
所以我们见到的 URI 主要以 URL 为主，基本上可以说 URL 约等于 URI 。

## 状态码

1. 1xx 信息，服务器收到请求，需要请求者继续执行操作
2. 2xx 成功，操作被成功接收并处理
3. 3xx 重定向，需要进一步的操作以完成请求
4. 4xx 客户端错误，请求包含语法错误或无法完成请求
5. 5xx 服务器错误，服务器在处理请求的过程中发生了错误

一些常见的状态码：

| 状态码  | 状态码英文名称               | 中文描述                                                                   |
|------|-----------------------|------------------------------------------------------------------------|
| 200  | OK                    | 	请求成功。一般用于GET与POST请求                                                   |
| 204	 | No Content            | 	无内容。服务器成功处理，但未返回内容。在未更新网页的情况下，可确保浏览器继续显示当前文档                          |
| 301  | 	Moved Permanently    | 	永久移动。请求的资源已被永久的移动到新URI，返回信息会包括新的URI，浏览器会自动定向到新URI。今后任何新的请求都应使用新的URI代替 |
| 302	 | Moved Temporarily     | 	临时移动。与301类似。但资源只是临时被移动。客户端应继续使用原有URI                                  |
| 400	 | Bad Request	          | 	客户端请求的语法错误，服务器无法理解                                                    |
| 401  | 	Unauthorized	        | 请求要求用户的身份认证                                                            |
| 403	 | Forbidden	            | 服务器理解请求客户端的请求，但是拒绝执行此请求（可能因为权限问题）                                      |
| 404	 | Not Found	            | 	服务器无法根据客户端的请求找到资源（网页）。通过此代码，网站设计人员可设置"您所请求的资源无法找到"的个性页面               |
| 500	 | Internal server Error | 服务器内部错误，无法完成请求                                                         |

更多状态码可以参考[文档](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status)

## HTTP 首部字段

HTTP 首部字段是构成 HTTP 报文的要素之一，在客户端与服务器之间以 HTTP 协议进行通信的过程中，无论是请求还是响应都会使用首部字段，它能起到传递额外重要信息的作用，比如报文主体大小、所使用的语言、认证信息、是否缓存、Cookie 等。
HTTP/1.1 规范定义了如下 47 种首部字段，分为四大类。还有一个其他扩展。

通用首部字段：请求报文和响应报文都可以使用的首部字段。9个

| 首部字段名              | 说明            |
|--------------------|---------------|
| Cache-Control	     | 控制缓存的行为       |
| Connection         | 	连接的管理        |
| Date	              | 创建报文的日期时间     |
| Pragma	            | 报文指令          |
| Trailer            | 	报文末端的首部一览    |
| Transfer-Encoding	 | 指定报文主体的传输编码方式 |
| Upgrade            | 	升级为其他协议      |
| Via	               | 代理服务器的相关信息    |
| Warning	           | 错误通知          |

请求首部字段：从客户端向服务器发送请求报文时使用的首部字段。18个

| 首部字段名                | 说明                              |
|----------------------|---------------------------------|
| Accept	              | 用户代理可处理的媒体类型                    |
| Accept-Charset	      | 优先的字符集                          |
| Accept-Encoding      | 	优先的内容编码                        |
| Accept-Language      | 	优先的语言（自然语言）                    |
| AuthorizationWeb     | 	认证信息                           |
| Expect               | 	期待服务器的特定行为                     |
| From                 | 	用户的电子邮箱地址                      |
| Host                 | 	请求资源所在服务器                      |
| If-Match             | 	比较实体标记（ETag）                   |
| If-Modified-Since    | 	比较资源的更新时间                      |
| If-None-Match	       | 比较实体标记（与 If-Match 相反）           |
| If-Range	            | 资源未更新时发送实体 Byte 的范围请求           |
| If-Unmodified-Since	 | 比较资源的更新时间（与If-Modified-Since相反） |
| Max-Forwards         | 	最大传输逐跳数                        |
| Proxy-Authorization  | 	代理服务器要求客户端的认证信息                |
| Range	               | 实体的字节范围请求                       |
| Referer	             | 对请求中 URI 的原始获取方                 |
| TE	                  | 传输编码的优先级                        |
| User-Agent           | 	客户端程序的信息                       |

响应首部字段：从服务器端向向客户端返回响应报文时使用的首部字段。9个

| 首部字段名               | 说明             |
|---------------------|----------------|
| Accept-Ranges	      | 是否接受字节范围请求     |
| Age                 | 	推算资源创建经过时间    |
| ETag                | 	资源的匹配信息       |
| Location	           | 令客户端重定向至指定URI  |
| Proxy-Authenticate	 | 代理服务器对客户端的认证信息 |
| Retry-After         | 	对再次发起请求的时机要求  |
| Server	             | HTTP服务器的安装信息   |
| Vary	               | 代理服务器缓存的管理信息   |
| WWW-Authenticate    | 	服务器对客户端的认证信息  |

实体首部字段：针对请求报文和响应报文的实体部分使用的首部字段。10个

| 首部字段名                 | 说明              |
|-----------------------|-----------------|
| Allow	                | 资源可支持的HTTP方法    |
| Content-Encoding	     | 实体主体适用的编码方式     |
| Content-Language	     | 实体主体的自然语言       |
| Content-Length        | 	实体主体的大小（单位：字节） |
| Content-Location      | 	替代对应资源的URI     |
| Content-MD5	实体主体的报文摘要 |
| Content-Range         | 	实体主体的位置范围      |
| Content-Type	         | 实体主体的媒体类型       |
| Expires	              | 实体主体过期的日期时间     |
| Last-Modified	        | 资源的最后修改日期时间     |

扩展首部字段：非 HTTP 协议标准规定的首部字段，通常由开发者创建，用于某些特殊用途，比如 Cookie、Set-Cookie。

详细具体的作用就不一一列举了，不然太多了，就成文档了。
具体用时可以再根据这些去查具体参数及用法。

## content-type 与 MIME

Content-Type（内容类型），一般是指网页中存在的 Content-Type，用于定义网络文件的类型和网页的编码，决定浏览器将以什么形式、什么编码读取这个文件。
Content-Type 标头告诉客户端实际返回的内容的内容类型。也是客户端告诉服务端请求体中内容的内容形式。

详细媒体格式可以参考[菜鸟教程](https://www.runoob.com/http/http-content-type.html)


MIME (Multipurpose Internet Mail Extensions) 是描述消息内容类型的标准，用来表示文档、文件或字节流的性质和格式。
因为因特网上有非常多不同类型的数据，HTTP 会为每种要通过 web 传输的对象都打上 MIME 类型的**数据格式标签**。

比较常用的几种：
HTML 格式的文本文档由 text/html  类型来标记
普通的 ASCII 文本文档由  text/plain  类型来标
JPEG 版本的图片为  image/jpeg  类型
GIF 格式的图片为 image/gif  类型
Apple 的 QuickTime 电影为 video/quicktime  类型
微软的 PowerPoint 演示文件为 application/vnd.ms-powerpoint 类型

其他更多的 MIME 类型可以参考[菜鸟教程](https://www.runoob.com/http/mime-types.html)

## 结尾

上文中实现的简单的 socket 程序接受浏览器的 http 请求。
如果它加上线程池，便可以同时处理多个请求。
另外在对其 http 请求和响应进行封装，便可以实现一个功能简单的 http服务器。






