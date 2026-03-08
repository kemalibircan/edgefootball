---
title: "Expected Goals Chain: Turning Sequences into Predictions"
description: "How xG chain and possession sequences help link build-up play to final score predictions in a responsible, data-driven way."
date: "2026-02-21"
updated: "2026-02-22"
lang: "en"
tags: ["xg-chain", "sequences", "analytics"]
slug: "expected-goals-chain-turning-sequences-into-predictions"
image: null
canonical: null
---

# Expected Goals Chain: Turning Sequences into Predictions

Classic xG looks at shots in isolation; xG chain extends the lens to the possessions that created those shots. For score prediction models, this richer view helps connect build-up quality to future goals.

This article explains what xG chain is and how it feeds into smarter, but still responsible, score predictions.

## 1. From isolated shots to possessions

Football is played in sequences, not single events.

- A sequence is a connected chain of actions before the ball changes team
- Multiple players contribute value before the final shot
- Turnovers and regains define where sequences start

xG chain assigns created chance value back through the entire possession.

## 2. Calculating xG chain

There are multiple implementations, but the core idea is consistent.

- Start with standard shot xG
- Distribute that xG across players involved in the build-up
- Attribute value to the team for repeatable pattern creation

This highlights players and teams who consistently power dangerous moves, not just finish them.

## 3. Why xG chain matters for predictions

Scorelines depend on the *process* of chance creation, not only final shooters.

- Teams with strong xG chain profiles tend to sustain quality chance production
- Sloppy sequences show up as frequent broken chains with low xG payoff
- Stable build-up translates into more predictable attacking output

Models can treat xG chain as a more process-oriented attacking strength signal.

## 4. Defending against dangerous chains

Defence is not just about blocking shots; it is also about disrupting the chain.

- Some teams are elite at ending possessions before they reach the box
- Others allow easy progression but defend the final ball well
- Counter-pressing profiles show up clearly in chain data

This gives another dimension for estimating expected goals against.

## 5. Model features from xG chain

To use xG chain, models extract a few stable indicators.

- Rolling averages of xG chain for and against
- Chain length and depth metrics (how many actions before the shot)
- Zone-based origin of dangerous sequences

These sit alongside basic xG, form, injuries and style signals.

## FAQ: xG chain and match scorelines

### Is xG chain always better than classic xG?

Neither is universally “better”; they answer different questions. xG looks at outcomes, while xG chain captures the underlying creative process.

### Does xG chain overrate certain positions?

Depending on the implementation, deep playmakers and wide progressors can show up strongly. That reflects their real influence on chance creation.

### How big a role should xG chain play in predictions?

It should be one signal among many, calibrated on out-of-sample results rather than intuition.

### Can xG chain explain sudden drops in scoring?

Often yes. A team’s goals may stay high for a while even as chain quality declines, which is a warning sign for future output.

### Does xG chain encourage risky play?

On its own, no. It simply measures sequences; how teams react is a coaching decision, not a modelling requirement.

## Conclusion and next steps

xG chain gives prediction models a more complete view of how teams build and concede dangerous situations.

When reading model explanations, references to sequence quality or “chains” are really about this more detailed understanding of attack and defence, not about guaranteeing any specific scoreline.

*** Add File: /Users/ali/.cursor/worktrees/FootballAi/mld/content/blog/tr/07-xg-zinciri-atak-sekanslarindan-tahmine.md
---
title: "xG Zinciri: Atak Sekanslarından Tahmine"
description: "xG zinciri kavramının, atak sekanslarını skor tahminlerine bağlamak için nasıl kullanıldığını ve sorumlu yorumlanması gerektiğini anlatan rehber."
date: "2026-02-21"
updated: "2026-02-22"
lang: "tr"
tags: ["xg-zinciri", "atak", "analitik"]
slug: "xg-zinciri-atak-sekanslarindan-tahmine"
image: null
canonical: null
---

# xG Zinciri: Atak Sekanslarından Tahmine

Klasik xG, şutları tek tek ele alırken; xG zinciri (xG chain) bakışı hücumu bir bütün olarak, yani sekans düzeyinde ele alır. Skor tahmin modelleri için bu, oyun kurulum kalitesini gelecekteki gollerle ilişkilendirmede önemli bir adımdır.

Bu yazıda xG zincirinin ne olduğunu ve skor tahminlerinde nasıl kullanıldığını konuşuyoruz.

## 1. Tekil şutlardan sekanslara geçiş

Futbol, kopuk olaylardan değil; birbirine bağlı aksiyon zincirlerinden oluşur.

- Sekans, top el değiştirmeden önce gerçekleşen aksiyonların bütünüdür
- Birden fazla oyuncu, şuttan önce değer yaratır
- Top kaybı ve geri kazanımlar, zincirin nerede başladığını belirler

xG zinciri, üretilen pozisyon değerini tüm bu sekansa dağıtır.

## 2. xG zinciri nasıl hesaplanır?

Yöntemler farklılık gösterse de temel fikir benzerdir.

- Önce klasik şut xG değeri hesaplanır
- Bu xG, hücum sekansındaki oyuncular arasında paylaştırılır
- Takım düzeyinde, tekrar eden tehlikeli yapıların değeri ortaya çıkar

Böylece yalnızca bitiriciler değil, atakları sürekli besleyen oyuncular da görünür olur.

## 3. Neden skor tahmini için önemlidir?

Skorlar, sadece son vuruşu yapan oyuncudan değil, tüm hazırlık sürecinden etkilenir.

- Güçlü xG zinciri profiline sahip takımlar, pozisyon kalitesini daha sürdürülebilir üretir
- Kırık sekanslar, bol top kaybı ve düşük xG ile sonuçlanan hücumları işaret eder
- İstikrarlı kurulum, gelecekteki hücum gücünün daha öngörülebilir olmasını sağlar

Modeller, xG zincirini hücum gücü için süreç odaklı bir sinyal olarak kullanabilir.

## 4. Tehlikeli zincirlere karşı savunmak

Savunma sadece şutu engellemekten ibaret değildir; zinciri erken kırmak da önemlidir.

- Bazı takımlar, sekansları ceza sahasına yaklaşmadan kesmekte çok iyidir
- Bazıları ise ilerlemeye izin verir ama son pası veya ortayı iyi savunur
- Karşı pres (counter-press) profilleri, zincir verilerinde net görünür

Bu, beklenen gol aleyhine (xG against) dair ek bir boyut sağlar.

## 5. xG zincirinden model özellikleri üretmek

Modeller xG zincirini birkaç istikrarlı göstergeye dönüştürür.

- xG zinciri for ve against için hareketli ortalamalar
- Zincir uzunluğu ve derinliği (şuttan önce kaç aksiyon var?)
- Tehlikeli sekansların hangi bölgelerden başladığı

Bu özellikler, temel xG, form, sakatlık ve stil sinyalleriyle birlikte kullanılır.

## SSS: xG zinciri ve maç skorları

### xG zinciri her zaman klasik xG’den daha mı iyidir?

Hayır. İkisi farklı sorulara cevap verir. xG sonucu, xG zinciri ise süreci ölçer; birlikte kullanıldığında daha güçlüdürler.

### xG zinciri bazı pozisyonları gereğinden fazla mı öne çıkarır?

Uygulamaya bağlı olarak derin oyun kurucular ve kanat progresyon oyuncuları belirgin hale gelebilir. Bu da aslında hücum sürecindeki gerçek etkilerini yansıtır.

### Tahminlerde xG zincirine ne kadar ağırlık vermeliyiz?

Birçok sinyalden sadece biridir. Ağırlığı, sezgiyle değil; görmediği maçlardaki performans üzerinden kalibre edilmelidir.

### xG zinciri, ani skor düşüşlerini açıklamaya yardım eder mi?

Çoğu zaman evet. Goller bir süre aynı kalsa bile zincir kalitesi düşmeye başladıysa, gelecekteki üretim için uyarı sinyali oluşur.

### xG zinciri riskli oyunu teşvik eder mi?

Kendisi sadece ölçüm yapar; nasıl tepki verileceği teknik ekibin kararıdır. Model, risk almayı zorunlu kılmaz.

## Sonuç ve sonraki adımlar

xG zinciri, takımların tehlikeli pozisyonları nasıl ürettiği ve engellediği konusunda daha derin bir bakış sunar.

Model açıklamalarında zincir kalitesi veya “sekanslar” vurgusunu gördüğünüzde, bu yaklaşımın tek tek skorları garanti etmeye değil, süreci daha iyi anlamaya yönelik olduğunu hatırlamak faydalıdır.


