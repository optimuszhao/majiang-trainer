# 广东红中麻将实战练习

单页静态 Web 程序，用第一人称麻将桌方式练习广东红中麻将。项目使用原生 HTML、CSS、JavaScript，可直接本地运行并部署到静态网站平台。

## 运行方式

方式一：直接用浏览器打开 `index.html`。

方式二：启动本地静态服务器：

```bash
python3 -m http.server 5173
```

访问：

```text
http://localhost:5173
```

## 项目结构

```text
index.html
styles.css
main.js
assets/
  tiles/
    wan-1.png ... wan-9.png
    tiao-1.png ... tiao-9.png
    tong-1.png ... tong-9.png
    wind-east.png wind-south.png wind-west.png wind-north.png
    dragon-red.png dragon-green.png dragon-white.png
    back.png
ATTRIBUTIONS.md
```

## 已实现功能

- 单页真实麻将桌布局
- 四家位置：我、下家、对家、上家
- 四面牌墙显示，剩余牌墙数量同步减少
- 136 张牌墙、洗牌、发牌、摸牌
- 我的手牌正面显示，三家手牌牌背显示
- 中间共同弃牌区，按时间顺序显示来源标记
- 每家明牌区，支持碰、明杠、暗杠、补杠展示
- 三个机器人按固定顺序出牌：我 → 下家 → 对家 → 上家 → 我
- 机器人智商 5 档，可分别设置
- 机器人出牌使用随机率 + 简化推荐算法
- 红中万能参与普通胡和七小对判断
- 我可以手动点击“我胡了”，系统判断真假胡
- 我可以碰、杠、过、整理手牌
- 杠后从牌墙末端补牌
- 杠牌即时金额结算
- 胡牌后从牌墙末端摸 6 张奖牌
- 1、5、9、东、红中算有效奖牌
- 奖牌按“底钱 × 有效奖牌数”结算
- 结算弹窗展示奖牌、有效奖牌、杠牌收入和四家金额
- 提示默认隐藏，点击“提示”后显示出牌建议
- 规则弹窗

## 简化实现

- AI 使用评分启发式，尚未实现完整真人级攻防模型。
- 向听数为简化估算，胡牌判断已独立实现红中万能递归拆牌。
- 机器人碰杠胡采用概率和评分结合。
- 放炮胡、抢杠等细分番型和完整广东地方变体暂未展开。

## 部署

上传 `index.html`、`styles.css`、`main.js`、`assets/`、`ATTRIBUTIONS.md` 即可静态部署。
