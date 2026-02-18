import json

from app.ai_commentary import _build_prompt


def test_build_prompt_includes_user_question():
    context = {"fixture_id": 123, "simulation": {"outcomes": {"home_win": 0.5}}}
    question = "Ev sahibi neden daha olasi?"

    prompt_messages = _build_prompt(context, language="tr", user_question=question)

    assert len(prompt_messages) == 3
    assert prompt_messages[0]["role"] == "system"
    assert prompt_messages[1]["role"] == "user"
    assert json.loads(prompt_messages[1]["content"])["fixture_id"] == 123
    assert prompt_messages[2]["role"] == "user"
    assert "Kullanici sorusu:" in prompt_messages[2]["content"]
    assert "Ev sahibi neden daha olasi?" in prompt_messages[2]["content"]


def test_build_prompt_skips_empty_user_question():
    context = {"fixture_id": 123}
    prompt_messages = _build_prompt(context, language="tr", user_question="   ")
    assert len(prompt_messages) == 2
