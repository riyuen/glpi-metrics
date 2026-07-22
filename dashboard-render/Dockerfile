# One-shot renderer, invoked by Rundeck via `docker compose run`. No server,
# no SMTP — it just produces dashboard.png/.xlsx/.html into a bind-mounted
# output directory for Rundeck's own email step to send.
FROM python:3.11-slim

WORKDIR /app
RUN pip install --no-cache-dir playwright==1.47.0 openpyxl==3.1.5 \
    && python -m playwright install --with-deps chromium

COPY render_dashboard.py .

CMD ["python", "render_dashboard.py"]
