# Diseño: Landing "Finanzas"

Fecha: 2026-05-25
Estado: Aprobado por el usuario

## Resumen

Landing page de finanzas personales, en español, hospedada gratis en GitHub Pages.
Cuatro secciones: calendario de gastos, comparador de remesas EE.UU.→MX, calculadora
de interés compuesto, y pulso de mercado + foros de finanzas. Los datos externos se
refrescan una vez al día mediante un robot de GitHub Actions que escribe archivos JSON
estáticos servidos por la página.

## Decisiones (confirmadas con el usuario)

- **Stack:** HTML/CSS/JS puro (sin framework, sin paso de compilación).
- **Hospedaje:** GitHub Pages en la cuenta `kx-vxn`.
- **Actualización de datos:** robot diario (GitHub Actions cron) → `/data/*.json`. Sin servidor.
- **Fuentes:** solo APIs públicas y gratuitas (sin claves de pago).
- **Persistencia del calendario:** localStorage del navegador (privado, sin sincronización).
- **Estilo:** oscuro premium fintech (azul marino/negro + acentos esmeralda y dorado).
- **Moneda:** base USD con equivalente en MXN al tipo de cambio del día.
- **Idioma de la UI:** español.

## Arquitectura

```
Finanzas/
├─ index.html
├─ css/styles.css
├─ js/
│  ├─ main.js        # navegación, carga de datos, sello "actualizado"
│  ├─ calendar.js    # sección 1
│  ├─ remesas.js     # sección 2
│  ├─ interes.js     # sección 3 (gráfica)
│  └─ feeds.js       # sección 4
├─ data/             # generado por el robot
│  ├─ rates.json     # tipo de cambio USD/MXN
│  ├─ remesas.json   # comparativa de remesadoras
│  ├─ reddit.json    # top posts de subreddits
│  └─ market.json    # índices, oro, cripto
├─ scripts/update-data.mjs   # script Node que baja datos y escribe /data
└─ .github/workflows/update-data.yml  # cron diario + commit de /data
```

Flujo: GitHub Actions (cron diario) ejecuta `scripts/update-data.mjs` → escribe `/data/*.json`
→ hace commit → GitHub Pages sirve la página y los JSON. El navegador hace `fetch` de los JSON.

## Sección 1 — Calendario de gastos mensual

- Calendario navegable mes a mes (anterior/siguiente).
- Captura de ingreso quincenal (USD) y gastos: diarios puntuales y mensuales recurrentes.
- Cada celda de día y el resumen mensual muestran balance: disponible (verde) / déficit (rojo).
- Resumen mensual: ingreso total, gastos totales, disponible, gasto diario sugerido restante.
- Equivalente en MXN usando `rates.json`.
- Persistencia en localStorage (clave por mes).

## Sección 2 — Comparador de remesas EE.UU.→México

- Input de monto a enviar (USD), default $1,000.
- Tabla ordenada de mejor a peor: proveedor, tipo de cambio efectivo, comisión, MXN recibido.
- Datos: `remesas.json`. El robot obtiene el tipo de cambio medio diario; intenta la
  comparación pública de Wise; si falla, calcula estimado con márgenes/comisiones típicos
  configurables por proveedor (Wise, Remitly, Western Union, etc.).
- Etiqueta visible: "estimado — verifica antes de enviar".

## Sección 3 — Calculadora de interés compuesto

- Controles: aporte mensual, tasa de interés anual, años, escenario de variación
  (optimista/base/pesimista).
- Gráfica de líneas: tu inversión vs activos comunes (S&P 500 ~10%, bonos ~4%, ahorro ~1%,
  bienes raíces ~5%, CETES MX ~10%). Constantes configurables, mostradas como supuestos.
- Tarjetas de contexto por zona: Carolina del Norte (brokerages/bienes raíces USA) y
  Querétaro/MX (Cetesdirecto, bienes raíces).
- 100% en el navegador, sin datos externos.

## Sección 4 — Pulso de mercado + foros de finanzas

- Datos de mercado (`market.json`): S&P 500, NASDAQ, oro, BTC, ETH con cambio del día.
  Fuentes: Stooq (CSV) y CoinGecko.
- Top posts del día (`reddit.json`) de subreddits de finanzas:
  - EE.UU.: r/personalfinance, r/investing, r/Bogleheads, r/stocks.
  - México: r/MexicoFinanciero, r/finanzasmexico (y similares; se omiten los que no respondan).
- Tarjetas curadas "Dónde invertir" enfocadas en NC y Querétaro.

## Fuentes de datos gratuitas

- Tipo de cambio: open.er-api.com (sin clave) con respaldo.
- Cripto: CoinGecko (sin clave).
- Índices/oro: Stooq CSV (sin clave).
- Reddit: endpoints `.json` públicos con User-Agent (desde Actions, lado servidor).
- Remesas: intento de comparación pública de Wise; respaldo estimado configurable.

## Limitaciones honestas

- Refresco diario, no en tiempo real.
- Remesas = mejor esfuerzo con fuentes gratis; los valores son orientativos.
- El feed de Reddit depende de la disponibilidad de sus endpoints públicos.
- Datos del calendario viven solo en el navegador usado (no se sincronizan entre dispositivos).

## Entrega

- Crear repositorio en GitHub (`kx-vxn`), subir el código y activar GitHub Pages.
- Ejecutar el robot una vez para poblar `/data` y publicar la URL.
