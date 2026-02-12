# design-system.md — ASBUH Portal UI (React 18 + Tailwind)

Единый источник правды для визуального стиля.  
Правило: **если чего-то нет здесь или в Figma — значит, этого не существует**.

---

## 1) Tech Stack

- React 18
- Tailwind CSS
- shadcn/ui (базовые компоненты)
- lucide-react (иконки)
- framer-motion (анимации)

---

## 2) Цвета

### Primary

- Основной (Primary): `#6567F1`
- Primary dark: `#5557E1`
- Primary darker: `#4547D1`
- Primary gradient: `from-[#6567F1] to-[#5557E1]`
- Primary shadow: `shadow-[#6567F1]/30`
- Primary light bg: `bg-[#6567F1]/10`, `bg-[#6567F1]/5`
- Primary border: `border-[#6567F1]/20`, `border-[#6567F1]/30`

### Текст

- Заголовки: `text-slate-900`
- Основной текст: `text-slate-600`
- Второстепенный: `text-slate-500`
- Приглушённый: `text-slate-400`

### Фоны

- Основной: `bg-white`
- Секции: `bg-slate-50`, `bg-gradient-to-b from-white via-slate-50 to-white`
- Футер: `bg-slate-900`
- Карточки: `bg-white` + `border border-slate-200`

### Акцентные градиенты (по темам)

- Бухучёт: `from-[#6567F1] to-indigo-500`
- Налоги: `from-sky-500 to-cyan-500`
- Кадры: `from-green-500 to-emerald-500`
- Аналитика: `from-orange-500 to-amber-500`
- Регистрация: `from-purple-500 to-pink-500`
- Консультации: `from-red-500 to-rose-500`
- 115-ФЗ: `from-amber-500 to-yellow-500`

---

## 3) Типографика

- H1: `text-5xl lg:text-6xl xl:text-7xl font-bold`
- H2: `text-4xl lg:text-5xl font-bold`
- H3: `text-2xl lg:text-3xl font-bold`
- Подзаголовки: `text-xl lg:text-2xl text-slate-600`
- Обычный текст: `text-lg text-slate-600`
- Мелкий текст: `text-sm text-slate-500`

---

## 4) Скругления и тени

- Карточки: `rounded-3xl` или `rounded-2xl`
- Кнопки: `rounded-md` (стандарт shadcn) или `rounded-full` (бейджи)
- Иконки в кругах: `rounded-xl` или `rounded-lg`
- Тени: `shadow-lg`, `hover:shadow-2xl`, `shadow-[#6567F1]/30`

---

## 5) Кнопки

### Primary CTA

```tsx
className =
  "bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white shadow-lg shadow-[#6567F1]/30";
```

Размер:

- большие: `text-lg h-14 px-8`
- обычные: стандарт shadcn

### Outline

```tsx
className = "border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5";
```

### Бейджи

```tsx
className = "bg-[#6567F1]/10 text-[#6567F1] px-4 py-2 rounded-full text-sm font-medium";
```

---

## 6) Тематика

- Авиационная метафора пронизывает весь сайт
- Иконки: `Plane`, `Shield`, `TrendingUp` из `lucide-react`
- Термины: «штурвал», «полёт бизнеса», «курс на успех», «турбулентности», «борт», «флот», «маршрут»
- Самолёты с анимацией покачивания и парения
- Облака — `blur-xl` белые блобы с `animate x/y`
- Логотип: `AS | BUH` + изображение: https://i.ibb.co/pj8v6ZVF/Chat-GPT-Image-21-2026-13-00-06-1.png

---

## 7) Анимации (framer-motion)

### Появление блоков

```tsx
initial={{ opacity: 0, y: 20 }}
whileInView={{ opacity: 1, y: 0 }}
viewport={{ once: true }}
transition={{ duration: 0.6 }}
```

### Появление hero

```tsx
initial={{ opacity: 0, x: -50 }}
animate={{ opacity: 1, x: 0 }}
transition={{ duration: 0.8 }}
```

### Парящие элементы (самолёты)

```tsx
animate={{ y: [0, -15, 0], rotate: [0, 3, -3, 0] }}
transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
```

### Облака

```tsx
animate={{ x: [-30, 30, -30] }}
transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
```

---

## 8) Адаптивность

- Контейнер: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Сетки: `grid sm:grid-cols-2 lg:grid-cols-3 gap-8`
- Хедер: фиксированный  
  `fixed top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200`, высота `h-20`
- Мобильное меню: бургер с анимацией трансформации

---

## 9) Шапка

- Фиксированная, с `backdrop-blur-md`
- Логотип слева, навигация по центру (`NavigationMenu` из shadcn), кнопки справа
- Ссылки: `text-slate-600 hover:text-[#6567F1]`
- Кнопки: «Личный кабинет» (outline)

---

## 10) Подвал (футер)

- `bg-slate-900 text-white py-16`
- 4 колонки: логотип, услуги, компания, контакты
- Ссылки: `text-slate-400 hover:text-[#6567F1]`
- Разделитель: `border-t border-slate-800`

---

## 11) Do / Don’t

### Do

- Использовать указанные цвета/градиенты/типографику
- Держать интерфейс чистым: карточки, сетки, ясные CTA
- Делать анимации мягкими и редкими

### Don’t

- Вводить новые цвета без необходимости
- Делать “праздник спецэффектов” (облака и самолёты — это акценты, не шоу)
- Перегружать текст авиа-терминами в каждом абзаце
