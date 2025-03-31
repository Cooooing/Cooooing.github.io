---
layout: post
title: 缓存淘汰算法LRU、LFU
date: 2025-03-31 11:50:57
tags:
  - go
  - 算法
  - 缓存
  - LRU
  - LFU
categories:
  - 学习笔记
---

## 缓存淘汰算法概述

缓存淘汰算法用于在缓存空间不足时决定哪些数据应该被移除，以腾出空间存储新数据。
两种最常用的算法是：

- **LRU (Least Recently Used)** - 最近最少使用，根据数据的历史访问记录来进行淘汰数据
- **LFU (Least Frequently Used)** - 最不经常使用，根据数据的历史访问频率来淘汰数据

## LRU (最近最少使用) 算法

LRU 基于时间局部性原理，认为最近被访问的数据在将来更有可能被再次访问。当缓存满时，LRU 会淘汰最久未被访问的数据。

### Go 实现

- 使用哈希表实现 O(1) 的查找
- 使用双向链表维护访问顺序
- 每次访问数据时，将其移动到链表头部
- 淘汰时从链表尾部移除数据

~~~go
package utils

import (
	"container/list"
	"sync"
)

// LRUCache 泛型结构体
type LRUCache[K comparable, V any] struct {
	capacity int
	cache    map[K]*list.Element
	list     *list.List
	mu       sync.RWMutex
}

// entry 用于存储键值对
type entry[K comparable, V any] struct {
	key   K
	value V
}

// NewLRUCache 创建一个新的泛型LRUCache
func NewLRUCache[K comparable, V any](capacity int) *LRUCache[K, V] {
	return &LRUCache[K, V]{
		capacity: capacity,
		cache:    make(map[K]*list.Element),
		list:     list.New(),
	}
}

// Get 获取键的值，如果不存在返回零值和false
func (l *LRUCache[K, V]) Get(key K) (V, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if elem, ok := l.cache[key]; ok {
		l.list.MoveToFront(elem)
		return elem.Value.(*entry[K, V]).value, true
	}
	var zero V
	return zero, false
}

// Put 插入或更新键值对
func (l *LRUCache[K, V]) Put(key K, value V) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.capacity <= 0 {
		return false
	}

	if elem, ok := l.cache[key]; ok {
		elem.Value.(*entry[K, V]).value = value
		l.list.MoveToFront(elem)
		return true
	}

	if l.list.Len() >= l.capacity {
		// 移除最久未使用的元素
		back := l.list.Back()
		if back != nil {
			delete(l.cache, back.Value.(*entry[K, V]).key)
			l.list.Remove(back)
		}
	}

	newEntry := &entry[K, V]{key, value}
	elem := l.list.PushFront(newEntry)
	l.cache[key] = elem
	return true
}

// Len 返回缓存中元素的数量
func (l *LRUCache[K, V]) Len() int {
	return l.list.Len()
}

~~~

### 测试

~~~go
package utils

import (
	"testing"
)

func TestLRUCache_EmptyCache(t *testing.T) {
	cache := NewLRUCache[string, int](2)

	// 测试空缓存
	if val, ok := cache.Get("nonexistent"); ok || val != 0 {
		t.Errorf("Get from empty cache should return zero value, got %v, %v", val, ok)
	}

	if l := cache.Len(); l != 0 {
		t.Errorf("Len of empty cache should be 0, got %d", l)
	}
}

func TestLRUCache_SingleItem(t *testing.T) {
	cache := NewLRUCache[string, int](1)

	// 测试单个元素
	cache.Put("one", 1)
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}

	// 测试替换
	cache.Put("two", 2)
	if val, ok := cache.Get("one"); ok {
		t.Errorf("Get('one') should be evicted, got %d, %v", val, ok)
	}
	if val, ok := cache.Get("two"); !ok || val != 2 {
		t.Errorf("Get('two') = %d, %v, want 2, true", val, ok)
	}
}

func TestLRUCache_EvictionPolicy(t *testing.T) {
	cache := NewLRUCache[string, int](2)

	// 初始填充
	cache.Put("one", 1)
	cache.Put("two", 2)

	// 访问one使其成为最近使用的
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}

	// 添加新元素，two应该被淘汰
	cache.Put("three", 3)
	if val, ok := cache.Get("two"); ok {
		t.Errorf("Get('two') should be evicted, got %d, %v", val, ok)
	}
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}
	if val, ok := cache.Get("three"); !ok || val != 3 {
		t.Errorf("Get('three') = %d, %v, want 3, true", val, ok)
	}
}

func TestLRUCache_UpdateExisting(t *testing.T) {
	cache := NewLRUCache[string, int](2)

	cache.Put("one", 1)
	cache.Put("one", 11) // 更新

	if val, ok := cache.Get("one"); !ok || val != 11 {
		t.Errorf("Get('one') = %d, %v, want 11, true", val, ok)
	}
	if l := cache.Len(); l != 1 {
		t.Errorf("Len should be 1 after update, got %d", l)
	}
}

func TestLRUCache_ZeroCapacity(t *testing.T) {
	cache := NewLRUCache[string, int](0)

	cache.Put("one", 1)
	if val, ok := cache.Get("one"); ok {
		t.Errorf("Get from zero-capacity cache should return nothing, got %d, %v", val, ok)
	}
}

func TestLRUCache_CustomTypes(t *testing.T) {
	type customKey struct {
		id   int
		name string
	}

	cache := NewLRUCache[customKey, string](2)

	key1 := customKey{1, "apple"}
	key2 := customKey{2, "banana"}

	cache.Put(key1, "red")
	cache.Put(key2, "yellow")

	if val, ok := cache.Get(key1); !ok || val != "red" {
		t.Errorf("Get(key1) = %s, %v, want 'red', true", val, ok)
	}

	// 测试淘汰
	cache.Put(customKey{3, "cherry"}, "pink")
	if val, ok := cache.Get(key2); ok {
		t.Errorf("Get(key2) should be evicted, got %s, %v", val, ok)
	}
}

func TestLRUCache_ConcurrentAccess(t *testing.T) {
	cache := NewLRUCache[string, int](100)
	done := make(chan bool)

	// 并发写入
	go func() {
		for i := 0; i < 10000; i++ {
			cache.Put("key", i)
		}
		done <- true
	}()

	// 并发读取
	go func() {
		for i := 0; i < 10000; i++ {
			cache.Get("key")
		}
		done <- true
	}()

	<-done
	<-done

	// 最终检查
	if val, ok := cache.Get("key"); !ok {
		t.Errorf("Key should exist after concurrent access")
	} else if val < 0 || val >= 10000 {
		t.Errorf("Unexpected value after concurrent access: %d", val)
	}
}

~~~

## LFU (最不经常使用) 算法

LFU 基于访问频率，认为访问次数最少的数据在未来被访问的可能性也最小。当缓存满时，LFU 会淘汰访问频率最低的数据。如果有多个数据具有相同的最低频率，则淘汰其中最久未被访问的数据。

### Go 实现

- 使用两个哈希表：一个存储键值对，一个存储频率到键列表的映射
- 使用双向链表维护相同频率下的访问顺序
- 需要维护一个最小频率变量

~~~go
package utils

import (
	"container/list"
	"sync"
)

// LFUCache 泛型结构体
type LFUCache[K comparable, V any] struct {
	capacity int
	minFreq  int
	items    map[K]*list.Element     // 存储键到元素的映射
	freqs    map[int]*list.List      // 存储频率到双向链表的映射
	entries  map[K]*cacheEntry[K, V] // 存储键到entry的映射(辅助快速访问)
	mu       sync.RWMutex
}

// cacheEntry 存储缓存值和频率信息
type cacheEntry[K comparable, V any] struct {
	key    K
	value  V
	freq   int
	parent *list.Element
}

// NewLFUCache 创建一个新的泛型LFUCache
func NewLFUCache[K comparable, V any](capacity int) *LFUCache[K, V] {
	return &LFUCache[K, V]{
		capacity: capacity,
		items:    make(map[K]*list.Element),
		freqs:    make(map[int]*list.List),
		entries:  make(map[K]*cacheEntry[K, V]),
	}
}

// Get 获取键的值，如果不存在返回零值和false
func (l *LFUCache[K, V]) Get(key K) (V, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if elem, ok := l.items[key]; ok {
		entry := elem.Value.(*cacheEntry[K, V])
		l.incrementFreq(elem, entry)
		return entry.value, true
	}
	var zero V
	return zero, false
}

// Put 插入或更新键值对
func (l *LFUCache[K, V]) Put(key K, value V) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.capacity <= 0 {
		return false
	}

	// 如果键已存在，更新值并增加频率
	if elem, ok := l.items[key]; ok {
		entry := elem.Value.(*cacheEntry[K, V])
		entry.value = value
		l.incrementFreq(elem, entry)
		return true
	}

	// 如果缓存已满，移除最不经常使用且最久未使用的项
	if len(l.items) >= l.capacity {
		l.removeMinFreqItem()
	}

	// 创建新条目
	entry := &cacheEntry[K, V]{
		key:   key,
		value: value,
		freq:  1,
	}

	// 添加到频率为1的列表中
	if l.freqs[1] == nil {
		l.freqs[1] = list.New()
	}
	elem := l.freqs[1].PushFront(entry)
	entry.parent = elem

	// 更新映射
	l.items[key] = elem
	l.entries[key] = entry

	// 更新最小频率
	l.minFreq = 1
	return true
}

// incrementFreq 增加条目的频率
func (l *LFUCache[K, V]) incrementFreq(elem *list.Element, entry *cacheEntry[K, V]) {
	// 从当前频率列表中移除
	l.freqs[entry.freq].Remove(elem)

	// 更新频率
	entry.freq++

	// 添加到新频率列表中
	if l.freqs[entry.freq] == nil {
		l.freqs[entry.freq] = list.New()
	}
	newElem := l.freqs[entry.freq].PushFront(entry)
	entry.parent = newElem

	// 更新items映射
	l.items[entry.key] = newElem

	// 如果旧频率是最小频率且该频率列表现在为空，更新最小频率
	if entry.freq-1 == l.minFreq && l.freqs[entry.freq-1].Len() == 0 {
		l.minFreq = entry.freq
	}
}

// removeMinFreqItem 移除最小频率的项
func (l *LFUCache[K, V]) removeMinFreqItem() {
	minList := l.freqs[l.minFreq]
	if minList == nil {
		return
	}

	// 移除列表中的最后一个元素(最久未使用)
	back := minList.Back()
	if back == nil {
		return
	}

	entry := back.Value.(*cacheEntry[K, V])
	minList.Remove(back)
	delete(l.items, entry.key)
	delete(l.entries, entry.key)
}

// Len 返回缓存中元素的数量
func (l *LFUCache[K, V]) Len() int {
	return len(l.items)
}

~~~

### 测试

~~~go
package utils

import (
	"testing"
)

func TestLFUCache_EmptyCache(t *testing.T) {
	cache := NewLFUCache[string, int](2)

	// 测试空缓存
	if val, ok := cache.Get("nonexistent"); ok || val != 0 {
		t.Errorf("Get from empty cache should return zero value, got %v, %v", val, ok)
	}

	if l := cache.Len(); l != 0 {
		t.Errorf("Len of empty cache should be 0, got %d", l)
	}
}

func TestLFUCache_SingleItem(t *testing.T) {
	cache := NewLFUCache[string, int](1)

	// 测试单个元素
	cache.Put("one", 1)
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}

	// 测试替换
	cache.Put("two", 2)
	if val, ok := cache.Get("one"); ok {
		t.Errorf("Get('one') should be evicted, got %d, %v", val, ok)
	}
	if val, ok := cache.Get("two"); !ok || val != 2 {
		t.Errorf("Get('two') = %d, %v, want 2, true", val, ok)
	}
}

func TestLFUCache_EvictionPolicy(t *testing.T) {
	cache := NewLFUCache[string, int](2)

	// 初始填充
	cache.Put("one", 1)
	cache.Put("two", 2)

	// 访问one增加其频率
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}

	// 添加新元素，two应该被淘汰(频率较低)
	cache.Put("three", 3)
	if val, ok := cache.Get("two"); ok {
		t.Errorf("Get('two') should be evicted, got %d, %v", val, ok)
	}
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}
	if val, ok := cache.Get("three"); !ok || val != 3 {
		t.Errorf("Get('three') = %d, %v, want 3, true", val, ok)
	}

	// 再访问three使其频率与one相同
	if val, ok := cache.Get("three"); !ok || val != 3 {
		t.Errorf("Get('three') = %d, %v, want 3, true", val, ok)
	}

	// 添加新元素，one应该被淘汰(相同频率但更久未使用)
	cache.Put("four", 4)
	if val, ok := cache.Get("one"); ok {
		t.Errorf("Get('one') should be evicted, got %d, %v", val, ok)
	}
	if val, ok := cache.Get("three"); !ok || val != 3 {
		t.Errorf("Get('three') = %d, %v, want 3, true", val, ok)
	}
	if val, ok := cache.Get("four"); !ok || val != 4 {
		t.Errorf("Get('four') = %d, %v, want 4, true", val, ok)
	}
}

func TestLFUCache_UpdateExisting(t *testing.T) {
	cache := NewLFUCache[string, int](2)

	cache.Put("one", 1)
	cache.Put("one", 11) // 更新

	if val, ok := cache.Get("one"); !ok || val != 11 {
		t.Errorf("Get('one') = %d, %v, want 11, true", val, ok)
	}
	if l := cache.Len(); l != 1 {
		t.Errorf("Len should be 1 after update, got %d", l)
	}
}

func TestLFUCache_ZeroCapacity(t *testing.T) {
	cache := NewLFUCache[string, int](0)

	cache.Put("one", 1)
	if val, ok := cache.Get("one"); ok {
		t.Errorf("Get from zero-capacity cache should return nothing, got %d, %v", val, ok)
	}
}

func TestLFUCache_MinFrequencyUpdate(t *testing.T) {
	cache := NewLFUCache[string, int](2)

	// 初始填充
	cache.Put("one", 1)
	cache.Put("two", 2)

	// 访问one增加其频率
	if val, ok := cache.Get("one"); !ok || val != 1 {
		t.Errorf("Get('one') = %d, %v, want 1, true", val, ok)
	}

	// 添加新元素，two应该被淘汰(频率较低)
	cache.Put("three", 3)

	// 现在minFreq应该是1(three的频率)
	if val, ok := cache.Get("three"); !ok || val != 3 {
		t.Errorf("Get('three') = %d, %v, want 3, true", val, ok)
	}

	// 再次访问three使其频率增加到2
	if val, ok := cache.Get("three"); !ok || val != 3 {
		t.Errorf("Get('three') = %d, %v, want 3, true", val, ok)
	}

	// 添加新元素，应该淘汰one(因为three频率更高)
	cache.Put("four", 4)
	if val, ok := cache.Get("one"); ok {
		t.Errorf("Get('one') should be evicted, got %d, %v", val, ok)
	}
}

func TestLFUCache_CustomTypes(t *testing.T) {
	type customKey struct {
		id   int
		name string
	}

	cache := NewLFUCache[customKey, string](2)

	key1 := customKey{1, "apple"}
	key2 := customKey{2, "banana"}

	cache.Put(key1, "red")
	cache.Put(key2, "yellow")

	// 访问key1增加其频率
	if val, ok := cache.Get(key1); !ok || val != "red" {
		t.Errorf("Get(key1) = %s, %v, want 'red', true", val, ok)
	}

	// 添加新元素，key2应该被淘汰(频率较低)
	cache.Put(customKey{3, "cherry"}, "pink")

	if val, ok := cache.Get(key2); ok {
		t.Errorf("Get(key2) should be evicted, got %s, %v", val, ok)
	}
}

func TestLFUCache_ConcurrentAccess(t *testing.T) {
	cache := NewLFUCache[string, int](100)
	done := make(chan bool)

	// 并发写入
	go func() {
		for i := 0; i < 10000; i++ {
			cache.Put("key", i)
		}
		done <- true
	}()

	// 并发读取
	go func() {
		for i := 0; i < 10000; i++ {
			cache.Get("key")
		}
		done <- true
	}()

	<-done
	<-done

	// 最终检查
	if val, ok := cache.Get("key"); !ok {
		t.Errorf("Key should exist after concurrent access")
	} else if val < 0 || val >= 10000 {
		t.Errorf("Unexpected value after concurrent access: %d", val)
	}
}

~~~

## LRU 和 LFU 的比较

| 特性    | LRU         | LFU         |
|-------|-------------|-------------|
| 淘汰策略  | 淘汰最久未使用的    | 淘汰使用频率最低的   |
| 实现复杂度 | 相对简单        | 相对复杂        |
| 适用场景  | 访问模式随时间变化不大 | 访问频率差异明显的场景 |
| 对突发流量 | 可能淘汰热点数据    | 对新数据不友好     |
| 内存消耗  | 较低          | 较高          |

- **LRU** 实现简单，适合大多数通用场景，对突发流量友好。
- **LFU** 适合访问模式相对稳定的场景，能更好地保留高频访问数据。

另外，还有 LRU 和 LFU 的变体和混合算法以及FIFO（First in First out），先进先出，最先进入的数据，最先被淘汰等算法，以不同的淘汰策略适应不同的应用场景。
