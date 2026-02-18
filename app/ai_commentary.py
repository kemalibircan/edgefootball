from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import httpx

from app.config import Settings
from sportmonks_client.client import SportMonksClient
from sportmonks_client.models import FixturePayload

WEB_NEWS_MAX_ITEMS = 6
WEB_NEWS_PER_QUERY = 4


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        for key in ("value", "day", "speed"):
            if key in value:
                return _to_float(value.get(key))
        return None
    text = str(value).strip().replace("%", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _team_info(payload: FixturePayload) -> Tuple[dict, dict]:
    participants = payload.data.participants or []
    if len(participants) < 2:
        return {"id": None, "name": "Home"}, {"id": None, "name": "Away"}
    home = next((p for p in participants if p.meta and p.meta.get("location") == "home"), participants[0])
    away = next((p for p in participants if p.meta and p.meta.get("location") == "away"), participants[1])
    return {"id": home.id, "name": home.name}, {"id": away.id, "name": away.name}


def _label_side(label: str, home_name: str, away_name: str) -> Optional[str]:
    value = _norm(label)
    if not value:
        return None

    if value in {"home", "1"}:
        return "home"
    if value in {"away", "2"}:
        return "away"
    if value in {"draw", "x", "tie"}:
        return "draw"

    if _norm(home_name) and _norm(home_name) in value:
        return "home"
    if _norm(away_name) and _norm(away_name) in value:
        return "away"
    return None


def _is_fulltime_result_market(description: str) -> bool:
    d = _norm(description)
    if not d:
        return False
    positive = ("match winner" in d) or ("fulltime result" in d) or ("full time result" in d)
    negative = (
        "1st half" in d
        or "2nd half" in d
        or "half time" in d
        or "corners" in d
        or "enhanced" in d
        or "result/total" in d
        or "result / total" in d
    )
    return positive and not negative


def summarize_odds(payload: FixturePayload) -> Dict[str, Any]:
    odds_rows = payload.data.odds or []
    home, away = _team_info(payload)
    home_name = home["name"]
    away_name = away["name"]

    side_rows: Dict[str, List[Dict[str, float]]] = {"home": [], "draw": [], "away": []}
    for row in odds_rows:
        if not _is_fulltime_result_market(str(row.get("market_description") or "")):
            continue
        side = _label_side(
            str(row.get("label") or row.get("name") or ""),
            home_name=home_name,
            away_name=away_name,
        )
        if side is None:
            continue
        value = _to_float(row.get("value"))
        if not value or value <= 1.0:
            continue
        implied_from_prob = _to_float(row.get("probability"))
        implied = implied_from_prob / 100.0 if implied_from_prob is not None else (1.0 / value)
        side_rows[side].append({"odds": value, "implied": implied})

    raw_implied = {}
    for side in ("home", "draw", "away"):
        values = side_rows[side]
        if not values:
            raw_implied[side] = None
            continue
        raw_implied[side] = float(mean(item["implied"] for item in values))

    total_raw = sum(v for v in raw_implied.values() if v is not None) or 0.0
    normalized: Dict[str, Optional[float]] = {}
    if total_raw > 0:
        for side, value in raw_implied.items():
            normalized[side] = (value / total_raw) if value is not None else None
    else:
        normalized = {"home": None, "draw": None, "away": None}

    summary = {
        "available": bool(side_rows["home"] and side_rows["draw"] and side_rows["away"]),
        "samples": {side: len(side_rows[side]) for side in ("home", "draw", "away")},
        "home": {
            "avg_decimal_odds": float(mean(item["odds"] for item in side_rows["home"])) if side_rows["home"] else None,
            "implied_probability": normalized["home"],
        },
        "draw": {
            "avg_decimal_odds": float(mean(item["odds"] for item in side_rows["draw"])) if side_rows["draw"] else None,
            "implied_probability": normalized["draw"],
        },
        "away": {
            "avg_decimal_odds": float(mean(item["odds"] for item in side_rows["away"])) if side_rows["away"] else None,
            "implied_probability": normalized["away"],
        },
    }
    return summary


def _fmt_pct(value: Optional[float]) -> str:
    if value is None:
        return "-"
    return f"%{(value * 100.0):.1f}"


def _fmt_num(value: Optional[float], digits: int = 2) -> str:
    if value is None:
        return "-"
    return f"{value:.{digits}f}"


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _parse_pub_date(value: str) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    try:
        parsed = parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        return ""


def _format_news_time(value: str) -> str:
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M")
    except Exception:
        return ""


def _rss_locale(language: str) -> Tuple[str, str, str]:
    if language.lower().startswith("tr"):
        return "tr", "TR", "TR:tr"
    return "en-US", "US", "US:en"


def _google_news_rss_url(query: str, language: str = "tr") -> str:
    hl, gl, ceid = _rss_locale(language)
    return f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={ceid}"


def _split_title_and_source(title: str, source: str) -> Tuple[str, str]:
    cleaned_title = _clean_text(title)
    cleaned_source = _clean_text(source)
    if cleaned_source:
        return cleaned_title, cleaned_source
    if " - " in cleaned_title:
        left, right = cleaned_title.rsplit(" - ", 1)
        if left.strip() and right.strip() and len(right.strip()) <= 80:
            return _clean_text(left), _clean_text(right)
    return cleaned_title, cleaned_source


def _fetch_rss_news_for_query(query: str, *, language: str = "tr", limit: int = WEB_NEWS_PER_QUERY) -> List[Dict[str, str]]:
    url = _google_news_rss_url(query, language=language)
    try:
        with httpx.Client(timeout=4.5, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            root = ET.fromstring(response.text)
    except Exception:
        return []

    rows: List[Dict[str, str]] = []
    for item in root.findall("./channel/item"):
        title_raw = item.findtext("title") or ""
        source_raw = item.findtext("source") or ""
        link = _clean_text(item.findtext("link") or "")
        published_at = _parse_pub_date(item.findtext("pubDate") or "")
        title, source = _split_title_and_source(title_raw, source_raw)
        if not title:
            continue
        rows.append(
            {
                "title": title,
                "source": source,
                "link": link,
                "published_at": published_at,
            }
        )
        if len(rows) >= limit:
            break
    return rows


def _web_news_context(home_team_name: str, away_team_name: str, *, language: str = "tr") -> List[Dict[str, str]]:
    home = _clean_text(home_team_name)
    away = _clean_text(away_team_name)
    if not home and not away:
        return []

    queries: List[str] = []
    if home and away:
        if language.lower().startswith("tr"):
            queries.append(f"\"{home}\" \"{away}\" mac haberi")
        else:
            queries.append(f"\"{home}\" \"{away}\" match news")
    if home:
        queries.append(f"\"{home}\" football")
    if away:
        queries.append(f"\"{away}\" football")

    dedup_keys: set[str] = set()
    items: List[Dict[str, str]] = []
    for query in queries:
        for row in _fetch_rss_news_for_query(query, language=language, limit=WEB_NEWS_PER_QUERY):
            key = f"{_clean_text(row.get('title')).lower()}|{_clean_text(row.get('link'))}"
            if key in dedup_keys:
                continue
            dedup_keys.add(key)
            items.append(row)
            if len(items) >= WEB_NEWS_MAX_ITEMS:
                return items
    return items


def _news_markdown_lines(news_rows: List[Dict[str, str]], language: str = "tr") -> List[str]:
    if not news_rows:
        if language.lower().startswith("tr"):
            return ["- Guncel web haberi bulunamadi."]
        return ["- No recent web news was found."]

    lines: List[str] = []
    for row in news_rows[:WEB_NEWS_MAX_ITEMS]:
        title = _clean_text(row.get("title") or "")
        source = _clean_text(row.get("source") or "") or ("Bilinmeyen Kaynak" if language.lower().startswith("tr") else "Unknown Source")
        published_at = _format_news_time(_clean_text(row.get("published_at") or ""))
        link = _clean_text(row.get("link") or "")
        meta_parts = [source]
        if published_at:
            meta_parts.append(published_at)
        meta_text = ", ".join(meta_parts)
        if link:
            lines.append(f"- {title} ({meta_text}) - [Kaynak]({link})")
        else:
            lines.append(f"- {title} ({meta_text})")
    return lines


def _lineup_summary(payload: FixturePayload, home_id: Optional[int], away_id: Optional[int]) -> Dict[str, Any]:
    rows = payload.data.lineups or []

    def summarize_team(team_id: Optional[int]) -> Dict[str, Any]:
        if team_id is None:
            return {"total": 0, "starters": 0, "bench": 0}
        team_rows = [row for row in rows if int(row.get("team_id") or -1) == int(team_id)]
        starters = [row for row in team_rows if row.get("formation_position") not in (None, "")]
        return {"total": len(team_rows), "starters": len(starters), "bench": max(0, len(team_rows) - len(starters))}

    return {
        "home": summarize_team(home_id),
        "away": summarize_team(away_id),
    }


def _text_or_none(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    text_value = value.strip()
    return text_value or None


def _is_valid_player_name(value: str) -> bool:
    return bool(value and not value.isdigit())


def _lineup_row_player_name(row: dict) -> Optional[str]:
    player_node = row.get("player")
    player_payload: dict = {}
    if isinstance(player_node, dict):
        nested = player_node.get("data")
        if isinstance(nested, dict):
            player_payload = nested
        else:
            player_payload = player_node

    direct_first = _text_or_none(row.get("firstname")) or _text_or_none(row.get("first_name"))
    direct_last = _text_or_none(row.get("lastname")) or _text_or_none(row.get("last_name"))
    direct_full = " ".join(part for part in [direct_first, direct_last] if part).strip() or None

    nested_first = _text_or_none(player_payload.get("firstname")) or _text_or_none(player_payload.get("first_name"))
    nested_last = _text_or_none(player_payload.get("lastname")) or _text_or_none(player_payload.get("last_name"))
    nested_full = " ".join(part for part in [nested_first, nested_last] if part).strip() or None

    candidates = [
        row.get("player_name"),
        row.get("name"),
        row.get("display_name"),
        row.get("common_name"),
        row.get("full_name"),
        direct_full,
        player_payload.get("player_name"),
        player_payload.get("name"),
        player_payload.get("display_name"),
        player_payload.get("common_name"),
        player_payload.get("full_name"),
        nested_full,
    ]
    for candidate in candidates:
        cleaned = _text_or_none(candidate)
        if cleaned and _is_valid_player_name(cleaned):
            return cleaned
    return None


def _player_name_map(payload: FixturePayload) -> Dict[int, str]:
    mapping: Dict[int, str] = {}
    for row in payload.data.lineups or []:
        player_node = row.get("player")
        player_payload: dict = {}
        if isinstance(player_node, dict):
            nested = player_node.get("data")
            if isinstance(nested, dict):
                player_payload = nested
            else:
                player_payload = player_node

        player_id = row.get("player_id")
        if player_id is None and player_payload:
            player_id = player_payload.get("id") or player_payload.get("player_id")
        if player_id is None:
            continue
        try:
            safe_player_id = int(player_id)
        except (TypeError, ValueError):
            continue
        name = _lineup_row_player_name(row)
        if name:
            mapping[safe_player_id] = name
    return mapping


def _sidelined_summary(payload: FixturePayload, home_id: Optional[int], away_id: Optional[int]) -> Dict[str, Any]:
    rows = payload.data.sidelined or []
    name_map = _player_name_map(payload)

    def summarize_team(team_id: Optional[int]) -> Dict[str, Any]:
        if team_id is None:
            return {"count": 0, "players": []}
        team_rows = [row for row in rows if int(row.get("participant_id") or -1) == int(team_id)]
        players: List[str] = []
        for row in team_rows:
            player_id = row.get("player_id")
            if player_id is None:
                continue
            player_name = name_map.get(int(player_id), f"Oyuncu {player_id}")
            if player_name not in players:
                players.append(player_name)
        return {"count": len(team_rows), "players": players[:5]}

    return {
        "home": summarize_team(home_id),
        "away": summarize_team(away_id),
    }


def _weather_summary(payload: FixturePayload) -> Dict[str, Any]:
    weather = payload.data.weatherreport
    if weather is None:
        return {"available": False}
    return {
        "available": True,
        "temperature_c": _to_float(weather.temperature),
        "wind_speed": _to_float(weather.wind),
        "humidity_pct": _to_float(weather.humidity),
        "type": weather.type,
    }


def _referee_summary(payload: FixturePayload, client: SportMonksClient) -> Dict[str, Any]:
    refs = payload.data.referees or []
    if not refs:
        return {"available": False}

    main = next((r for r in refs if int(r.type_id or -1) == 9), refs[0])
    referee_id = int(main.referee_id) if main.referee_id is not None else None
    if referee_id is None:
        return {"available": False}

    try:
        raw = client.get_referee(referee_id)
        data = raw.get("data") or {}
    except Exception:
        data = {}

    return {
        "available": True,
        "referee_id": referee_id,
        "name": data.get("name"),
        "yellow_cards_per_game": _to_float(data.get("yellow_cards_per_game")),
        "penalties_per_game": _to_float(data.get("penalties_per_game")),
    }


def _context_metrics(payload: FixturePayload, client: SportMonksClient) -> Dict[str, Any]:
    home, away = _team_info(payload)
    weather = _weather_summary(payload)
    referee = _referee_summary(payload, client=client)
    sidelined = _sidelined_summary(payload, home_id=home["id"], away_id=away["id"])
    lineup = _lineup_summary(payload, home_id=home["id"], away_id=away["id"])

    return {
        "home_team": home,
        "away_team": away,
        "weather": weather,
        "referee": referee,
        "sidelined": sidelined,
        "lineup": lineup,
        "trends_count": len(payload.data.trends or []),
        "ball_coordinates_count": len(payload.data.ballCoordinates or []),
    }


def _analysis_table(
    *,
    simulation: Dict[str, Any],
    odds: Dict[str, Any],
    metrics: Dict[str, Any],
) -> List[Dict[str, str]]:
    outcomes = simulation.get("outcomes") or {}
    model_home = outcomes.get("home_win")
    model_draw = outcomes.get("draw")
    model_away = outcomes.get("away_win")

    odds_home = (odds.get("home") or {}).get("implied_probability")
    odds_draw = (odds.get("draw") or {}).get("implied_probability")
    odds_away = (odds.get("away") or {}).get("implied_probability")

    weather = metrics["weather"]
    referee = metrics["referee"]
    sidelined = metrics["sidelined"]
    lineup = metrics["lineup"]

    rows: List[Dict[str, str]] = [
        {
            "metric": "Model 1X2 Olasiligi",
            "home": _fmt_pct(model_home),
            "draw": _fmt_pct(model_draw),
            "away": _fmt_pct(model_away),
            "note": "Monte Carlo simulasyon ciktilari",
        },
        {
            "metric": "Piyasa 1X2 Olasiligi (normalize)",
            "home": _fmt_pct(odds_home),
            "draw": _fmt_pct(odds_draw),
            "away": _fmt_pct(odds_away),
            "note": "Bookmaker ortalama decimal oranlardan turetilmis implied probability",
        },
        {
            "metric": "Model - Piyasa Farki",
            "home": _fmt_pct((model_home or 0.0) - (odds_home or 0.0)),
            "draw": _fmt_pct((model_draw or 0.0) - (odds_draw or 0.0)),
            "away": _fmt_pct((model_away or 0.0) - (odds_away or 0.0)),
            "note": "Pozitif deger modelin piyasaya gore daha yuksek olasilik verdigini gosterir",
        },
        {
            "metric": "Beklenen Gol (Lambda)",
            "home": _fmt_num(_to_float(simulation.get("lambda_home"))),
            "draw": "-",
            "away": _fmt_num(_to_float(simulation.get("lambda_away"))),
            "note": "Modelin gol ortalamasi beklentisi",
        },
        {
            "metric": "Sakat/Eksik Oyuncu Sayisi",
            "home": str((sidelined.get("home") or {}).get("count") or 0),
            "draw": "-",
            "away": str((sidelined.get("away") or {}).get("count") or 0),
            "note": "Sidelined datasindan",
        },
        {
            "metric": "Muhtemel Ilk 11 Sayisi",
            "home": str((lineup.get("home") or {}).get("starters") or 0),
            "draw": "-",
            "away": str((lineup.get("away") or {}).get("starters") or 0),
            "note": "Lineup formasyon pozisyonuna gore",
        },
    ]

    weather_note = "-"
    if weather.get("available"):
        weather_note = (
            f"Sicaklik {_fmt_num(weather.get('temperature_c'), 1)} C, "
            f"ruzgar {_fmt_num(weather.get('wind_speed'), 1)}, "
            f"nem {_fmt_num(weather.get('humidity_pct'), 0)}%, "
            f"tip {weather.get('type') or '-'}"
        )
    rows.append(
        {
            "metric": "Hava Durumu",
            "home": "-",
            "draw": "-",
            "away": "-",
            "note": weather_note,
        }
    )

    referee_note = "Hakem istatistigi bulunamadi"
    if referee.get("available"):
        referee_note = (
            f"Referee ID {referee.get('referee_id')}, "
            f"k/m {_fmt_num(referee.get('yellow_cards_per_game'))}, "
            f"penalti/m {_fmt_num(referee.get('penalties_per_game'))}"
        )
    rows.append(
        {
            "metric": "Hakem Etkisi",
            "home": "-",
            "draw": "-",
            "away": "-",
            "note": referee_note,
        }
    )

    sidelined_home_players = ", ".join((sidelined.get("home") or {}).get("players") or []) or "-"
    sidelined_away_players = ", ".join((sidelined.get("away") or {}).get("players") or []) or "-"
    rows.append(
        {
            "metric": "Eksik Oyuncu Ornekleri",
            "home": sidelined_home_players,
            "draw": "-",
            "away": sidelined_away_players,
            "note": "Ilk 5 isim/ID",
        }
    )

    rows.append(
        {
            "metric": "Ek Veri Sinyalleri",
            "home": f"trend={metrics.get('trends_count', 0)}",
            "draw": "-",
            "away": f"ballCoord={metrics.get('ball_coordinates_count', 0)}",
            "note": "Guncel fixture baglami",
        }
    )

    return rows


def _fallback_commentary(context: Dict[str, Any], analysis_table: List[Dict[str, str]], language: str = "tr") -> str:
    outcomes = context["simulation"]["outcomes"]
    model_name = context["simulation"]["model"]["model_name"] or "Model"
    sim_home = outcomes.get("home_win", 0.0) * 100.0
    sim_draw = outcomes.get("draw", 0.0) * 100.0
    sim_away = outcomes.get("away_win", 0.0) * 100.0

    if language.lower().startswith("tr"):
        weather_row = next((r for r in analysis_table if r["metric"] == "Hava Durumu"), None)
        injury_row = next((r for r in analysis_table if r["metric"] == "Sakat/Eksik Oyuncu Sayisi"), None)
        referee_row = next((r for r in analysis_table if r["metric"] == "Hakem Etkisi"), None)
        odds = context.get("odds", {})
        news_lines = _news_markdown_lines(context.get("web_news") or [], language=language)

        parts = [
            "## Macin Kisa Ozeti",
            (
                f"- {model_name} tahminine gore en olasi dagilim: Ev %{sim_home:.1f}, "
                f"Beraberlik %{sim_draw:.1f}, Deplasman %{sim_away:.1f}."
            ),
            f"- Beklenen gol seviyesi: {context['simulation']['lambda_home']:.2f} - {context['simulation']['lambda_away']:.2f}.",
        ]
        if odds.get("available"):
            o_home = ((odds.get("home") or {}).get("implied_probability") or 0.0) * 100
            o_draw = ((odds.get("draw") or {}).get("implied_probability") or 0.0) * 100
            o_away = ((odds.get("away") or {}).get("implied_probability") or 0.0) * 100
            parts.extend(
                [
                    "## Neden Bu Sonuc Olasi",
                    f"- Piyasa dagilimi: Ev %{o_home:.1f}, Beraberlik %{o_draw:.1f}, Deplasman %{o_away:.1f}.",
                    "- Model ile piyasa arasinda fark varsa bu kesin sonuc degil, olasilik farki anlamina gelir.",
                ]
            )
        else:
            parts.extend(
                [
                    "## Neden Bu Sonuc Olasi",
                    "- Piyasa oran verisi sinirli oldugu icin model olasiliklari ana referans alindi.",
                ]
            )

        parts.append("## Saha Etkenleri")
        if weather_row:
            parts.append(f"- Hava notu: {weather_row['note']}.")
        if referee_row:
            parts.append(f"- Hakem notu: {referee_row['note']}.")
        if injury_row:
            parts.append(f"- Eksik oyuncu sayisi: Ev {injury_row['home']} - Deplasman {injury_row['away']}.")

        parts.append("## Webdeki Guncel Haberler")
        parts.extend(news_lines)
        parts.extend(
            [
                "## Dikkat Edilmesi Gereken Riskler",
                "- Son dakika kadro degisimi, erken kart veya penalti akisi tahmini hizla degistirebilir.",
                "## Sonuc",
                "- Bu yorum olasilik bazlidir. Kesin sonucun garantisi yoktur.",
            ]
        )
        return "\n".join(parts)

    return "AI commentary fallback is active. OpenAI API key is missing or request failed."


def _build_prompt(
    context: Dict[str, Any],
    language: str = "tr",
    user_question: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if language.lower().startswith("tr"):
        instruction = (
            "Sen deneyimli bir futbol analistisin. Verilen simulasyon, odds, mac baglami (sakatlik, lineup, hava, hakem) "
            "ve web haberleri listesini kullanarak Turkce yorum yaz.\n"
            "Kurallar:\n"
            "- Yanit tamamen Markdown olsun.\n"
            "- Basliklar su sirada olsun: "
            "## Macin Kisa Ozeti, ## Neden Bu Sonuc Olasi, ## Saha Etkenleri, "
            "## Webdeki Guncel Haberler, ## Dikkat Edilmesi Gereken Riskler, ## Sonuc.\n"
            "- Son kullanicinin kolay anlayacagi dil kullan. Agir teknik terimlerden kac; gerekiyorsa tek cumlede acikla.\n"
            "- Haber bolumunde sadece verilen web_news verisini kullan. Kaynak uydurma.\n"
            "- Sayisal degerleri net yaz, ama kesinlik iddiasi kurma ve finansal tavsiye verme.\n"
            "- Kullanicinin sorusu varsa o soruya dogrudan ve acik sekilde cevap ver.\n"
            "- Yanit en fazla 220 kelime olsun."
        )
    else:
        instruction = (
            "You are an experienced football analyst. Use simulation, odds and current match context "
            "(injuries, lineup, weather, referee) and produce a concise, structured analysis with uncertainty."
        )

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": instruction},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
    ]
    question_text = _clean_text(user_question)
    if question_text:
        messages.append({"role": "user", "content": f"Kullanici sorusu: {question_text}"})
    return messages


def _extract_response_text(payload: Dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    output = payload.get("output") or []
    chunks: List[str] = []
    for item in output:
        content_items = item.get("content") or []
        for part in content_items:
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
    return "\n".join(chunks).strip()


def generate_match_commentary(
    *,
    settings: Settings,
    fixture_id: int,
    simulation_result: Dict[str, Any],
    language: str = "tr",
    user_question: Optional[str] = None,
) -> Dict[str, Any]:
    client = SportMonksClient(
        api_token=settings.sportmonks_api_token,
        dummy_mode=settings.dummy_mode,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        cache_ttl=settings.cache_ttl_seconds,
        timeout_seconds=settings.sportmonks_timeout_seconds,
    )
    fixture_payload = client.get_fixture(
        fixture_id,
        includes=[
            "participants",
            "odds",
            "lineups",
            "sidelined",
            "weatherreport",
            "referees",
            "trends",
            "ballcoordinates",
        ],
    )
    odds_summary = summarize_odds(fixture_payload)
    metrics = _context_metrics(fixture_payload, client=client)
    analysis_table = _analysis_table(simulation=simulation_result, odds=odds_summary, metrics=metrics)
    match_info = simulation_result.get("match") or {}
    home_name = _clean_text(match_info.get("home_team_name") or (metrics.get("home_team") or {}).get("name"))
    away_name = _clean_text(match_info.get("away_team_name") or (metrics.get("away_team") or {}).get("name"))
    web_news = _web_news_context(home_name, away_name, language=language)

    context = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "fixture_id": fixture_id,
        "match": simulation_result.get("match"),
        "simulation": {
            "model": simulation_result.get("model"),
            "outcomes": simulation_result.get("outcomes"),
            "lambda_home": simulation_result.get("lambda_home"),
            "lambda_away": simulation_result.get("lambda_away"),
            "top_scorelines": simulation_result.get("top_scorelines", [])[:5],
            "key_drivers": simulation_result.get("key_drivers", []),
        },
        "odds": odds_summary,
        "context_metrics": metrics,
        "web_news": web_news,
        "analysis_table": analysis_table,
    }

    if not settings.openai_api_key:
        return {
            "provider": "fallback",
            "model": None,
            "commentary": _fallback_commentary(context, analysis_table, language=language),
            "odds_summary": odds_summary,
            "web_news": web_news,
            "analysis_table": analysis_table,
            "provider_error": "OPENAI_API_KEY is missing",
        }

    request_payload = {
        "model": settings.openai_model,
        "input": _build_prompt(context, language=language, user_question=user_question),
    }

    try:
        with httpx.Client(timeout=settings.openai_timeout_seconds) as http_client:
            response = http_client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=request_payload,
            )
            response.raise_for_status()
            payload = response.json()
            commentary = _extract_response_text(payload)
            if not commentary:
                commentary = _fallback_commentary(context, analysis_table, language=language)
                provider = "fallback"
                provider_error = "OpenAI response contained no output text"
            else:
                provider = "openai"
                provider_error = None
            return {
                "provider": provider,
                "model": settings.openai_model,
                "commentary": commentary,
                "odds_summary": odds_summary,
                "web_news": web_news,
                "analysis_table": analysis_table,
                "provider_error": provider_error,
            }
    except Exception as exc:
        return {
            "provider": "fallback",
            "model": settings.openai_model,
            "commentary": _fallback_commentary(context, analysis_table, language=language),
            "odds_summary": odds_summary,
            "web_news": web_news,
            "analysis_table": analysis_table,
            "provider_error": f"{exc.__class__.__name__}: {exc}",
        }
