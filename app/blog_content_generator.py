from __future__ import annotations

"""
Utility script to generate bilingual placeholder blog posts (EN + TR)
under `content/blog/en` and `content/blog/tr`.

It is idempotent: if a target file already exists it will be left untouched.
Run from the project root:

    python -m app.blog_content_generator
"""

from dataclasses import dataclass
from pathlib import Path
from typing import List
import datetime
import textwrap


BASE_DIR = Path(__file__).resolve().parents[1]
CONTENT_DIR_EN = BASE_DIR / "content" / "blog" / "en"
CONTENT_DIR_TR = BASE_DIR / "content" / "blog" / "tr"


@dataclass
class PostTitlePair:
    index: int
    title_en: str
    title_tr: str


TITLE_PAIRS: List[PostTitlePair] = [
    PostTitlePair(1, "How AI Predicts Football Scores: From Data to Final Scoreline",
                  "Yapay Zeka Futbol Skorlarını Nasıl Tahmin Eder? Veriden Skora"),
    PostTitlePair(2, "xG Explained: The Metric Behind Smarter Score Predictions",
                  "xG Nedir? Daha Akıllı Skor Tahmininin Temeli"),
    PostTitlePair(3, "Home Advantage Is Real: How Stadiums Change Match Outcomes",
                  "Ev Sahibi Avantajı Gerçek: Stadyumlar Sonuçları Nasıl Değiştirir?"),
    PostTitlePair(4, "Form vs. Fixtures: Which Matters More for Predicting Scores?",
                  "Form mu Fikstür mü? Skor Tahmininde Hangisi Daha Önemli?"),
    PostTitlePair(5, "Injuries & Suspensions: Quantifying Their Impact on Scorelines",
                  "Sakatlık ve Cezalar: Skorlara Etkisi Nasıl Ölçülür?"),
    PostTitlePair(6, "Pressing, Possession, and Pace: Styles That Shape the Score",
                  "Pres, Topa Sahip Olma ve Tempo: Skoru Şekillendiren Oyun Stilleri"),
    PostTitlePair(7, "Expected Goals Chain: Turning Sequences into Predictions",
                  "xG Zinciri: Atak Sekanslarından Tahmine"),
    PostTitlePair(8, "Why “Small Samples” Mislead: Avoiding Prediction Traps",
                  "Küçük Örneklem Neden Yanıltır? Tahmin Tuzaklarından Kaçınma"),
    PostTitlePair(9, "Weather, Pitch, and Travel: Hidden Variables in Match Results",
                  "Hava, Zemin ve Seyahat: Maç Sonuçlarındaki Gizli Değişkenler"),
    PostTitlePair(10, "Derbies and Rivalries: When Emotion Beats Statistics",
                  "Derbiler ve Rekabet: Duyguların İstatistiği Aştığı Anlar"),
    PostTitlePair(11, "Interpreting Probability: What a 60% Win Chance Really Means",
                  "Olasılığı Yorumlamak: %60 Kazanma İhtimali Ne Demek?"),
    PostTitlePair(12, "Scoreline Scenarios: Reading a Match with “Game States”",
                  "Skor Senaryoları: “Oyun Durumları” ile Maçı Okumak"),
    PostTitlePair(13, "Model Drift in Sports: Why Predictions Change Over Time",
                  "Sporda Model Sapması: Tahminler Neden Zamanla Değişir?"),
    PostTitlePair(14, "Transfer Windows: How New Signings Shift Team Strength",
                  "Transfer Dönemleri: Yeni Oyuncular Takım Gücünü Nasıl Değiştirir?"),
    PostTitlePair(15, "Building Trust in AI Predictions: Transparency & Explainability",
                  "Yapay Zeka Tahminine Güven: Şeffaflık ve Açıklanabilirlik"),
    PostTitlePair(16, "Pre-Match vs Live Predictions: What Changes After Kickoff?",
                  "Maç Önü ve Canlı Tahmin: Başlama Vuruşundan Sonra Ne Değişir?"),
    PostTitlePair(17, "Overfitting 101: When a Model “Learns” the Wrong Lessons",
                  "Overfitting 101: Model Yanlış Dersleri Nasıl “Öğrenir”?"),
    PostTitlePair(18, "Elo Ratings for Football: A Practical Guide",
                  "Futbolda Elo Puanı: Pratik Rehber"),
    PostTitlePair(19, "Set Pieces Matter: Corners, Free Kicks, and Goals",
                  "Duran Toplar Önemli: Korner, Frikik ve Goller"),
    PostTitlePair(20, "Goalkeeper Effects: Measuring Saves That Change Matches",
                  "Kaleci Etkisi: Maçı Değiştiren Kurtarışları Ölçmek"),
    PostTitlePair(21, "Shot Quality vs Shot Volume: Which Predicts Goals Better?",
                  "Şut Kalitesi mi Şut Sayısı mı? Golleri Hangisi Daha İyi Tahmin Eder?"),
    PostTitlePair(22, "The “Second Half” Myth: Do Teams Really Improve After HT?",
                  "“İkinci Yarı” Efsanesi: Takımlar Devreden Sonra Gerçekten Artar mı?"),
    PostTitlePair(23, "Red Cards and Chaos: Modeling Low-Probability Events",
                  "Kırmızı Kart ve Kaos: Düşük Olasılıklı Olayları Modellemenin Yolu"),
    PostTitlePair(24, "Creating Better Features: Turning Match Data into Signals",
                  "Daha İyi Özellikler: Maç Verisini Sinyale Dönüştürmek"),
    PostTitlePair(25, "Calibration Matters: Are Our Probabilities Honest?",
                  "Kalibrasyon Şart: Olasılıklarımız Ne Kadar “Dürüst”?"),
    PostTitlePair(26, "Prediction Confidence: When to Trust the Model More (or Less)",
                  "Tahmin Güveni: Modeli Ne Zaman Daha Çok (ya da Az) Dinlemeli?"),
    PostTitlePair(27, "Season Phases: Early Season vs Run-In Predictions",
                  "Sezon Evreleri: Sezon Başı ve Final Dönemi Tahminleri"),
    PostTitlePair(28, "League Differences: Why Models Behave Differently Across Leagues",
                  "Lig Farkları: Modeller Liglere Göre Neden Değişir?"),
    PostTitlePair(29, "From 0–0 to 3–2: Explaining High-Variance Matches",
                  "0–0’dan 3–2’ye: Yüksek Varyanslı Maçları Açıklamak"),
    PostTitlePair(30, "A Responsible Guide to Using Predictions as Information",
                  "Tahminleri Bilgi Olarak Kullanmak: Sorumlu Kullanım Rehberi"),
]


def slugify(value: str) -> str:
    """Very small slugify helper suitable for our titles."""
    value = value.strip().lower()
    translations = str.maketrans(
        {
            "ç": "c",
            "ğ": "g",
            "ı": "i",
            "ö": "o",
            "ş": "s",
            "ü": "u",
            "’": "",
            "“": "",
            "”": "",
            "‘": "",
            "’": "",
        }
    )
    value = value.translate(translations)
    allowed = []
    for ch in value:
        if ch.isalnum():
            allowed.append(ch)
        elif ch in [" ", "-", "_"]:
            allowed.append("-")
    slug = "".join(allowed)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


def generate_en_body(title: str) -> str:
    paragraphs = textwrap.dedent(
        f"""
        # {title}

        Modern football analytics treats predictions as probability distributions, not promises. This article explains the concept in plain language so you can use our AI model as a responsible information source.

        We focus on how to interpret the signals coming from the model, not on selling shortcuts or “guaranteed wins”.

        ## 1. Framing the question correctly

        The first step is to decide what you are actually trying to understand from the prediction: match outcome, goal counts or risk profile.

        A clear question makes it easier to decide whether the model’s output is helpful for that decision or not.

        ## 2. Data and features behind the prediction

        Under the hood, the system combines match history, team strength, schedule context and style indicators into numerical features.

        These features allow the model to compare today’s fixture with thousands of similar situations from the past.

        ## 3. Turning model outputs into practical insight

        Raw probabilities only become useful once you translate them into practical statements like “this match is volatile” or “this favourite is fairly stable”.

        The goal is to support your football understanding, not to replace it.

        ## 4. Monitoring and updating over time

        As teams, leagues and data definitions evolve, models must be monitored for drift and recalibrated.

        A responsible platform regularly checks live performance instead of assuming yesterday’s parameters are still valid.

        ## FAQ

        ### Are these predictions betting advice?

        No. They are informational probabilities designed to help you read matches more clearly. They should never be treated as financial advice.

        ### Why do numbers move close to kickoff?

        Lineups, injuries and tactical news all change the underlying information set. A living model updates when the inputs change.

        ### Can I ignore my own football knowledge?

        You shouldn’t. The best results come from combining model outputs with your own match reading and context.

        ## Conclusion and CTA

        Used in the right way, AI predictions are a transparent, quantitative lens on football rather than a shortcut to easy wins.

        To see these ideas in action, open today’s fixtures in our AI predictor, explore the score probabilities and compare them with your own expectations.
        """
    ).strip()
    return paragraphs + "\n"


def generate_tr_body(title: str) -> str:
    paragraphs = textwrap.dedent(
        f"""
        # {title}

        Modern futbol analitiği, tahminleri garanti değil, olasılık dağılımı olarak görür. Bu yazı, model çıktısını sorumlu bir bilgi aracı olarak okumanız için sade bir çerçeve sunar.

        Amaç, sistemi “kestirme yol” olarak değil, maçları daha iyi anlamanızı sağlayan şeffaf bir araç olarak kullanmaktır.

        ## 1. Soruyu doğru çerçevelemek

        Önce modelden ne öğrenmek istediğinizi netleştirmek gerekir: maç sonucu mu, gol sayısı mı, yoksa risk profili mi?

        Net bir soru, model çıktısının o karar için gerçekten faydalı olup olmadığını tartmanıza yardımcı olur.

        ## 2. Tahminin arkasındaki veri ve özellikler

        Sistem; maç geçmişi, takım gücü, fikstür yoğunluğu ve oyun stili göstergelerini sayısal özelliklere dönüştürür.

        Bu özellikler, bugünkü maçı geçmişteki binlerce benzer durumla karşılaştırmayı mümkün kılar.

        ## 3. Model çıktısını pratik yoruma dönüştürmek

        Ham olasılıklar, “bu maç yüksek varyanslı” veya “bu favori oldukça stabil” gibi pratik ifadelere dönüştürüldüğünde anlam kazanır.

        Hedef, futbol bilginizi tamamlamak; onu tamamen değiştirmek değildir.

        ## 4. Zaman içinde izleme ve güncelleme

        Takımlar, ligler ve veri tanımları değiştikçe modeller sapmaya başlayabilir; bu yüzden düzenli izleme ve kalibrasyon gerekir.

        Sorumlu bir platform, dün çalışan parametrelerin bugün de geçerli olduğunu varsaymaz.

        ## SSS

        ### Bu tahminler bahis tavsiyesi midir?

        Hayır. Tahminler, maçları daha net okumanız için tasarlanmış bilgi amaçlı olasılıklardır ve finansal tavsiye olarak görülmemelidir.

        ### Neden oranlar maç saatine yaklaştıkça değişiyor?

        Kadro, sakatlık ve taktik haberleri bilgi setini günceller. Canlı bir model de bu yeni veriye göre çıktısını yeniler.

        ### Kendi futbol yorumumu görmezden gelebilir miyim?

        Hayır. En sağlıklı yaklaşım, model çıktısını kendi maç okumanız ve bağlam bilginizle birleştirmektir.

        ## Sonuç ve çağrı

        Doğru kullanıldığında yapay zeka tahminleri, kolay kazanç vaadi değil; futbola saydam ve nicel bir bakış açısı sunar.

        Bugünkü fikstürü incelemek için platformdaki yapay zeka tahmin bölümünü açabilir, skor olasılıklarını kendi beklentilerinizle karşılaştırabilirsiniz.
        """
    ).strip()
    return paragraphs + "\n"


def write_post(lang: str, index: int, title: str) -> None:
    today = datetime.date(2026, 2, 21)
    if lang == "en":
        slug = slugify(title)
        directory = CONTENT_DIR_EN
        body = generate_en_body(title)
        tags = '["ai-football", "education"]'
    else:
        slug = slugify(title)
        directory = CONTENT_DIR_TR
        body = generate_tr_body(title)
        tags = '["yapay-zeka", "egitim"]'

    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{index:02d}-{slug}.md"
    path = directory / filename

    if path.exists():
        # Do not overwrite existing handcrafted content.
        return

    frontmatter = textwrap.dedent(
        f"""\
        ---
        title: "{title}"
        description: ""
        date: "{today.isoformat()}"
        updated: "{today.isoformat()}"
        lang: "{lang}"
        tags: {tags}
        slug: "{slug}"
        image: null
        canonical: null
        ---

        """
    )

    path.write_text(frontmatter + body, encoding="utf-8")


def main() -> None:
    for pair in TITLE_PAIRS:
        write_post("en", pair.index, pair.title_en)
        write_post("tr", pair.index, pair.title_tr)


if __name__ == "__main__":
    main()













