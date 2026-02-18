from __future__ import annotations

import smtplib
import time
from email.message import EmailMessage
from typing import Optional

from app.config import Settings


class MailDeliveryError(RuntimeError):
    pass


def _resolve_from_address(settings: Settings) -> str:
    from_address = str(settings.smtp_from_address or "").strip()
    if from_address:
        return from_address
    fallback = str(settings.smtp_username or "").strip()
    if fallback:
        return fallback
    raise MailDeliveryError("SMTP from address is not configured.")


def send_email(
    settings: Settings,
    *,
    to_address: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    host = str(settings.smtp_host or "").strip()
    if not host:
        raise MailDeliveryError("SMTP host is not configured.")

    username = str(settings.smtp_username or "").strip() or None
    password = str(settings.smtp_password or "").strip() or None
    from_address = _resolve_from_address(settings)
    from_name = str(settings.smtp_from_name or "").strip() or "Football AI"

    msg = EmailMessage()
    msg["Subject"] = str(subject or "").strip() or "Football AI"
    msg["From"] = f"{from_name} <{from_address}>"
    msg["To"] = str(to_address or "").strip()
    msg.set_content(str(text_body or "").strip() or " ")

    if html_body:
        msg.add_alternative(str(html_body), subtype="html")

    port = int(settings.smtp_port)
    timeout = max(3, int(settings.smtp_timeout_seconds))
    use_ssl = bool(settings.smtp_use_ssl)
    use_tls = bool(settings.smtp_use_tls)

    attempts = max(1, int(settings.smtp_retry_attempts))
    backoff = max(0.0, float(settings.smtp_retry_backoff_seconds))
    last_exc: Optional[Exception] = None

    for attempt in range(1, attempts + 1):
        try:
            if use_ssl:
                with smtplib.SMTP_SSL(host=host, port=port, timeout=timeout) as smtp:
                    if username and password:
                        smtp.login(username, password)
                    smtp.send_message(msg)
                return

            with smtplib.SMTP(host=host, port=port, timeout=timeout) as smtp:
                smtp.ehlo()
                if use_tls:
                    smtp.starttls()
                    smtp.ehlo()
                if username and password:
                    smtp.login(username, password)
                smtp.send_message(msg)
            return
        except Exception as exc:  # pragma: no cover
            last_exc = exc
            if attempt < attempts and backoff > 0:
                time.sleep(backoff)

    raise MailDeliveryError(f"SMTP delivery failed: {last_exc}") from last_exc
