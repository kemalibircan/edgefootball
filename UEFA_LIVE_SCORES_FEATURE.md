# ⚽ UEFA Şampiyonlar Ligi & Avrupa Ligi Canlı Skorlar

## 🎯 Yeni Özellikler

### 1. **Şampiyonlar Ligi ve Avrupa Ligi Desteği**
Artık FootballAI, Avrupa'nın en prestijli iki turnuvasını da destekliyor:
- 🏆 **UEFA Şampiyonlar Ligi** (Champions League)
- 🥈 **UEFA Avrupa Ligi** (Europa League)

### 2. **Canlı Skor Gösterimi**
Modern bahis sitelerindeki gibi profesyonel canlı skor deneyimi:
- 🔴 **Canlı Gösterge**: Yanıp sönen LIVE etiketi
- ⚽ **Anlık Skorlar**: Dakika bazında güncellenen skorlar
- ⏱️ **Maç Dakikası**: İlavve süre gösterimi (örn: 45'+2)
- 📊 **Periyot Bilgisi**: İlk Yarı, İkinci Yarı, Devre Arası, Uzatmalar

### 3. **Akıllı Güncelleme**
- **Canlı maç var**: 10 saniyede bir güncelleme
- **Canlı maç yok**: 30 saniyede bir güncelleme
- Batarya dostu otomatik optimizasyon

## 📱 Kullanıcı Arayüzü

### Canlı Maç Kartı
```
┌──────────────────────────────────────────┐
│ [🔴 LIVE] Şampiyonlar Ligi         67'   │
│ ╔═══════════════════════════════════════╗│
│ ║ Manchester City              [2]      ║│
│ ║ Real Madrid                  [1]      ║│
│ ╚═══════════════════════════════════════╝│
└──────────────────────────────────────────┘
```

### Özellikler:
- ✅ Kırmızı kenarlık (canlı maçlar için)
- ✅ Yanıp sönen LIVE göstergesi
- ✅ Büyük puan gösterimi
- ✅ Dakika ve eklenen süre
- ✅ Otomatik güncelleme

## 🎮 Nasıl Kullanılır

### Mobil Uygulama

1. **Uygulamayı Aç**
   - Ana sayfada tüm maçları göreceksiniz

2. **Canlı Maçları Takip Et**
   - Canlı maçlar otomatik olarak üstte görünür
   - Kırmızı kenarlık ile işaretlenmiştir
   - 🔴 LIVE etiketi yanıp söner

3. **Detaylara Bak**
   - Maça tıklayarak detayları görebilirsiniz
   - AI tahminleri ve analiz için sohbet özelliğini kullanın

### Filtreler

Liglere göre filtreleme:
- 🇹🇷 Süper Lig
- 🇪🇸 La Liga
- 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League
- 🇮🇹 Serie A
- 🏆 Şampiyonlar Ligi
- 🥈 Avrupa Ligi

## 🤖 AI Model Desteği

### Otomatik Lig Tanıma
Sistem, maçın hangi ligden olduğunu otomatik olarak algılar ve o lige özel modeli kullanır:

- **Şampiyonlar Ligi Maçı** → Şampiyonlar Ligi modeli
- **Avrupa Ligi Maçı** → Avrupa Ligi modeli
- **Diğer Ligler** → Lig-özgü modeller

### Model Avantajları
Her lig için özel eğitilmiş modeller:
- 📊 Lig karakteristikleri
- 🏟️ Takım güçleri
- 📈 Sezon trendleri
- 🎯 Daha doğru tahminler

## 🔧 Teknik Detaylar

### Veri Kaynağı
- **API**: Sportmonks Football API
- **Güncelleme**: Otomatik, gerçek zamanlı
- **Kapsam**: Maç skorları, dakika, periyot bilgisi

### Performans
- **Hız**: 10 saniye (canlı) / 30 saniye (normal)
- **Verimlilik**: Optimize edilmiş database sorguları
- **Animasyonlar**: React Native Reanimated

## 📊 Veri Yapısı

### API Yanıtı
```json
{
  "fixture_id": 12345,
  "league_name": "Champions League",
  "is_live": true,
  "scores": {
    "home_score": 2,
    "away_score": 1
  },
  "state": {
    "state": "2nd Half",
    "minute": 67,
    "added_time": null
  },
  "home_team_name": "Manchester City",
  "away_team_name": "Real Madrid",
  "markets": {
    "match_result": {
      "1": 1.75,
      "0": 3.50,
      "2": 4.20
    }
  }
}
```

## 🎯 Avantajlar

### 1. **Gerçek Zamanlı Takip**
- Maç skorlarını anında görün
- Dakika bazında güncellemeler
- İlave süre gösterimi

### 2. **Profesyonel Deneyim**
- Modern bahis sitesi tasarımı
- Pürüzsüz animasyonlar
- Kullanıcı dostu arayüz

### 3. **Akıllı Sistem**
- Otomatik model seçimi
- Adaptif güncelleme hızı
- Batarya optimizasyonu

### 4. **Kapsamlı Kapsam**
- 6 büyük lig
- UEFA turnuvaları
- Günlük maç güncellemeleri

## 📱 Desteklenen Platformlar

- ✅ iOS (iPhone, iPad)
- ✅ Android (Tüm cihazlar)
- ✅ Web (Yakında)

## 🚀 Gelecek Özellikler

- 🎥 Canlı maç istatistikleri
- 📊 Gelişmiş grafikler
- 🔔 Push bildirimleri (gol, kart, vb.)
- ⚡ Maç olayları timeline
- 🎮 Canlı bahis önerileri

## 💡 İpuçları

1. **Canlı Maç Saatlerinde Aç**
   - Şampiyonlar Ligi: Salı-Çarşamba 19:45, 22:00
   - Avrupa Ligi: Perşembe 19:45, 22:00

2. **AI Analiz Kullan**
   - Maç detaylarında sohbet özelliğini kullan
   - "Bu maçta kim kazanır?" diye sor
   - Detaylı analiz ve tahmin al

3. **Kupon Oluştur**
   - Birden fazla maçı birleştir
   - AI destekli kupon önerileri al
   - Kazanma ihtimallerini gör

## 📞 Destek

Sorularınız için:
- 📧 Email: edgefootballoffical@gmail.com
- 💬 Uygulama içi destek

---

**Keyifli maç takipleri! ⚽🎉**
