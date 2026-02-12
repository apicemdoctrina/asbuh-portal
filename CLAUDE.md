# CLAUDE.md — Project Operating Rules

## Source of truth
- PROJECT_BRIEF.md = что делаем в MVP (Этап 1).
- ROADMAP.md = что НЕ делаем до релиза MVP.
- DESIGN_SYSTEM.md = визуальные правила UI.

## Workflow
- Делай маленькие изменения (1 задача = 1 PR/коммитный набор).
- Перед изменениями: краткий план (5–10 строк).
- После: запусти линтер/тесты и опиши как проверить руками.

## Safety
- Никогда не создавай/не проси реальные секреты. Только .env.example.
- Не трогай файлы из deny-листа (.claude/settings.json).

## Coding conventions
- React 18 + Tailwind. UI допускается временный, стиль — по DESIGN_SYSTEM.md.
- Не добавляй новые зависимости без причины и объяснения.