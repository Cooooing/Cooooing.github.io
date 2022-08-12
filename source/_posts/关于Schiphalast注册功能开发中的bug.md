---
title: 关于Schiphalast注册功能开发中的bug
date: 2022-08-12 12:50:52
tags:
- bug
- java
- MD5
- ip
- session
- mail
- 数据库连接池
categories:
- bug及解决方案
---

## 简介

这个功能写成了一个springboot项目，部署在taptap的云引擎上。
[taptap云引擎官方文档](https://developer.taptap.com/docs/sdk/engine/overview/)
使用了官方提供的命令行工具，创建项目和部署到云引擎。[命令行文档](https://developer.taptap.com/docs/sdk/engine/cli/)
他生成的项目实际是springboot的改版，添加了一些他们独有的功能。比如云函数等。
实际开发与平时一致（~~他们提供的功能其实基本没用到，或许以后会用到。~~

另外，要吐槽的一个点就是：
项目生成默认配置使用的是Java11，但是部署到云引擎时，报错。
换成Java8后正常运行。
版本问题，影响不大。~~新版任你发，我用Java 8。~~

## 可复用模块

### 从请求中获取ip地址

Remote Address：
Remote Address代表HTTP请求的远程地址，即请求的源地址。http协议在三次握手时时用的就是这个Remote Address地址，发送响应报文时也是使用的这个Remote Address地址。
所以，Remote Address地址是不能伪造的，否则请求者会收不到响应报文。
> 但是，**http请求经过代理服务器转发时，用户真实ip会丢失。**所以有了`X-Forwarded-For`获取ip的方式。

X-Forwarded-For：
为了避免真实ip的丢失，代理服务器会增加叫X-Forwarded-For的头信息。将客户端ip记录到其中，以保证服务器可以获取到客户端真实ip。
X-Forwarded-For是一个拓展头。虽然HTTP/1.1（RFC 2616）协议并没有对它的定义，但它已经成为事实上的标准（都在用
X-Forwarded-For请求头格式：`X-Forwarded-For: client, proxy1, proxy2`
第一个便是请求的原始ip，后面则是代理服务器的ip。
> 由于请求头可以伪造，所以**不要相信请求头中携带的ip信息**。

> 直接对外提供服务的 Web 应用，在进行与安全有关的操作时，只能通过 Remote Address 获取 IP，不能相信任何请求头；
> 使用 Nginx 等 Web Server 进行反向代理的 Web 应用，在配置正确的前提下，要用 X-Forwarded-For 最后一节 或 X-Real-IP 来获取 IP（因为 Remote Address 得到的是 Nginx 所在服务器的内网 IP）；同时还应该禁止 Web 应用直接对外提供服务；
> 在与安全无关的场景，例如通过 IP 显示所在地天气，可以从 X-Forwarded-For 靠前的位置获取 IP，但是需要校验 IP 格式合法性；

参考文章：
[关于X-Forwarded-For的介绍](https://www.runoob.com/w3cnote/http-x-forwarded-for.html)
[HTTP 请求头中的 X-Forwarded-For](https://imququ.com/post/x-forwarded-for-header-in-http.html)

代码：
~~~java
    /**
     * 从HttpServletRequest中获取ip
     * @param request 请求
     * @return ip
     */
    public static String getIP(HttpServletRequest request) {
        String ip = request.getHeader("x-forwarded-for");
        if (ip == null || ip.length() == 0 || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.length() == 0 || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Forwarded-For");
        }
        if (ip == null || ip.length() == 0 || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.length() == 0 || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.length() == 0 || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
            if ("127.0.0.1".equalsIgnoreCase(ip) || "0:0:0:0:0:0:0:1".equalsIgnoreCase(ip)) {
                // 根据网卡取本机配置的 IP
                InetAddress iNet = null;
                try {
                    iNet = InetAddress.getLocalHost();
                } catch (UnknownHostException e) {
                    e.printStackTrace();
                }
                if (iNet != null)
                    ip = iNet.getHostAddress();
            }
        }
        // 对于通过多个代理的情况，分割出第一个 IP
        if (ip != null && ip.length() > 15) {
            if (ip.indexOf(",") > 0) {
                ip = ip.substring(0, ip.indexOf(","));
            }
        }
        return "0:0:0:0:0:0:0:1".equals(ip) ? "127.0.0.1" : ip;
    }
~~~

### 密码的md5加密

MD5，全称 消息摘要算法第五版（Message Digest Algorithm 5）
不多介绍，详见[MD5百度百科](https://baike.baidu.com/item/MD5/212708)

关于加密算法的改进：
1. 加盐
    即**在原来的明文中加入一组随机串**，再通过加密算法加密，将密文存入数据库。
2. 加次数
    即多加密几次，增加破解难度。不过会消耗更多计算资源。

jdk自带api：
~~~java
    /**
     * md5加密
     * @param password 需要加密的字符串
     * @return 加密后的字符串
     */
    public static String md5(String password){
        String hashedPwd = null;
        try {
            //生成MessageDigest对象，指定使用的消息摘要算法
            MessageDigest md = MessageDigest.getInstance("MD5");
            //传入需要计算的字符串，传入参数为字节或字节数组
            md.update(password.getBytes());
            /*
            digest()计算消息摘要，返回值为字节数组。16个字节，128bit
            通过BigInteger将其转换成32位的16进制数（每个字节用两个16进制数表示）
            或者16位16进制数，去掉32位前后各8位
             */
            hashedPwd = new BigInteger(1, md.digest()).toString(16);
        } catch (NoSuchAlgorithmException e) {
            e.printStackTrace();
        }
        return hashedPwd;
    }
~~~

spring的DigestUtils工具类
~~~java
    public static String md5(String password) {
        // 基于spring框架中的DigestUtils工具类进行密码加密
        return DigestUtils.md5DigestAsHex((password).getBytes());
    }
~~~

### 发送mail邮件

使用JavaMail发送邮件

依赖：
~~~xml
        <!--javamail的依赖-->
        <dependency>
            <groupId>javax.mail</groupId>
            <artifactId>mail</artifactId>
            <version>1.4.7</version>
        </dependency>
~~~
代码：
~~~java
    //邮件服务器地址（比如smtp.qq.com
    private static final String mailHost = null;
    //邮件传输协议（通常为smtp
    private static final String mailTransportProtocol = "smtp";
    //邮箱认证（即登录
    private static final String mailSmtpAuth = "true";
    //发件人邮箱地址
    private static final String fromEmail = null;
    //发件人邮箱密码
    private static final String password = null;
    /**
     * 发送邮件
     * @param toEmail 发往邮箱地址
     */
    public static void sendMail(String toEmail){
        //发送的内容（可以是dom文档
        String sendContent = "test mail";
        //创建，发送邮件
        Properties prop = new Properties();
        prop.setProperty("mail.host", mailHost);
        prop.setProperty("mail.transport.protocol", mailTransportProtocol);
        prop.setProperty("mail.smtp.auth", mailSmtpAuth);
        //使用JavaMail发送邮件的5个步骤
        //1、创建session
        Session session = Session.getInstance(prop);
        //2、通过session得到transport对象
        Transport ts;
        try {
            ts = session.getTransport();
            //3、使用邮箱的用户名和密码连上邮件服务器，发送邮件时，发件人需要提交邮箱的用户名和密码给smtp服务器，用户名和密码都通过验证之后才能够正常发送邮件给收件人。
            ts.connect(mailHost, fromEmail, password);
            //4、创建邮件
            MimeMessage message = new MimeMessage(session);
            //指明邮件的发件人
            message.setFrom(new InternetAddress(fromEmail));
            //指明邮件的收件人
            message.setRecipient(Message.RecipientType.TO, new InternetAddress(toEmail));
            //邮件的标题
            message.setSubject("标题");
            //邮件的文本内容
            message.setContent(sendContent, "text/html;charset=UTF-8");
            //5、发送邮件
            ts.sendMessage(message, message.getAllRecipients());
            ts.close();
        } catch (MessagingException e) {
            e.printStackTrace();
        }
    }
~~~

参考文章：
[使用JavaMail创建邮件和发送邮件](https://www.cnblogs.com/xdp-gacl/p/4216311.html)

---

使用springboot集成的mail模块

依赖：
~~~xml
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-mail</artifactId>
        </dependency>
~~~
配置：
~~~properties
spring.mail.protocol=
spring.mail.host=
spring.mail.username=
spring.mail.password=
~~~
代码：
~~~java
    @Resource
    private JavaMailSender javaMailSender;
    @Value("${fromEmail}")
    private String fromEmail;
    /**
     * 发送邮件
     * @param toEmail 发往邮箱地址
     */
    public static void sendMail(String toEmail){
        //发送的内容（可以是dom文档
        String sendContent = "test mail";
        try {
            MimeMessageHelper messageHelper = new MimeMessageHelper(javaMailSender.createMimeMessage(), true);
            messageHelper.setFrom(fromEmail);
            messageHelper.setTo(toEmail);
            messageHelper.setSubject("标题");
            messageHelper.setText(sendContent, true);
            javaMailSender.send(messageHelper.getMimeMessage());
        } catch (MessagingException e) {
            e.printStackTrace();
        }
    }
~~~

### jdbc数据库连接池（鸽了）

因为建立数据库连接与关闭数据库连接是非常耗时的事情，如果每次查询都建立连接、关闭连接会产生很大的性能开销。
所以有了连接池的出现来解决这一问题。
即在程序启动时，初始化连接池（连接数据库，创建多个连接）。在需要使用时从连接池中获取连接，使用结束放回连接池。
以减少性能开销。

代码：
~~~
先鸽了
~~~

## bug及解决方案

### session变化

#### 现象
ajax请求及其余请求在前几次请求时，session会发送变化。导致存在session中的数据获取不到。

#### 原因
通过HttpServletRequest获取session对象时，使用 `request.getSession()` 方法。
getSession方法会检测当前是否有session存在，默认**不存在会创建一个新的session**，存在则返回。

ajax请求跨域请求默认不携带cookie信息。即获取不到session

#### 解决方案（未解决）

调用getSession方法时传入参数false或true
例如：`request.getSession(false);`
为true时，先查看请求时是否有sessionID。如果没有，则创建一个新的session对象。如果有则根据sessionID查找对应的session对象，找到了就返回该session对象，没找到就创建新的session对象。
为false时，先查看请求中是否有sessionID，没有则返回null。有则根据sessionID查找对应的session对象，找到了就返回该session对象，没找到就创建新的session对象。
**默认为true**

建议：
往session中写入参数时使用 `request.getSession();`
从session中读取参数时使用 `request.getSession(false);`

附session其他操作：
设置值：`session.setAttribute(String name,Object obj);`
读取值：`session.getAttribute(String name);`
删除session：`session.invalidate();`

---

让ajax请求携带参数
添加属性：`xhr.withCredentials=true`

附js原生实现ajax请求：
~~~javascript
var Ajax = {
        get: function (url, callback) {
            // XMLHttpRequest对象用于在后台与服务器交换数据
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.onreadystatechange = function () {
                // readyState == 4说明请求已完成
                if (xhr.readyState == 4) {
                    if (xhr.status == 200 || xhr.status == 304) {
                        console.log(xhr.responseText);
                        callback(xhr.responseText);
                    }
                }
            }
            xhr.send();
        },

        // data应为'a=a1&b=b1'这种字符串格式，在jq里如果data为对象会自动将对象转成这种字符串格式
        post: function (url, data, callback) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, false);
            // 跨域携带cookie
            xhr.withCredentials=true
            // 添加http头，发送信息至服务器时内容编码类型
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200 || xhr.status === 304) {
                        // console.log(xhr.responseText);
                        callback(xhr.responseText);
                    }
                }
            }
            xhr.send(data);
        }
    }
~~~
---

说明：
这个bug其实并未解决，因为部署到tap云引擎时，是一个springboot项目。所有的请求应该都是同源的，不会出现跨域的情况。
而session变化原因，就是getSession会创建新的session对象。
将getSession传入false，同时改完ajax属性后，这个bug依旧会出现。
在部署到生产环境后，依旧有用户偶尔会出现了session为null的情况。
> 2022-08-12 暂未解决。

## 总结

第一次使用平台提供的自动化的部署和管理功能。
有部署状态（预备环境和生产环境）、请求统计、日志、及环境变量各种设置等。
taptap云服务还是很成熟的。相比自己在腾讯云服务器上使用要方便很多，不管是部署还是监控。
官方文档也相对很齐全，参看文档来使用是完全可以的。
