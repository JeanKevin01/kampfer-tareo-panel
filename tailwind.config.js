/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        barlow: ['Barlow', 'sans-serif'],
        condensed: ['Barlow Condensed', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Paleta k-*: los valores viven en src/index.css como canales RGB
        // (`--k-*`) para soportar el tema claro sin tocar los ~3.100 usos. El
        // formato `rgb(var() / <alpha-value>)` conserva los modificadores de
        // opacidad de Tailwind (bg-k-raised/50, border-k-amber/30, …).
        k: {
          void: 'rgb(var(--k-void) / <alpha-value>)',
          surface: 'rgb(var(--k-surface) / <alpha-value>)',
          raised: 'rgb(var(--k-raised) / <alpha-value>)',
          border: 'rgb(var(--k-border) / <alpha-value>)',
          border2: 'rgb(var(--k-border2) / <alpha-value>)',
          text: 'rgb(var(--k-text) / <alpha-value>)',
          text2: 'rgb(var(--k-text2) / <alpha-value>)',
          text3: 'rgb(var(--k-text3) / <alpha-value>)',
          amber: 'rgb(var(--k-amber) / <alpha-value>)',
          amber2: 'rgb(var(--k-amber2) / <alpha-value>)',
          green: 'rgb(var(--k-green) / <alpha-value>)',
          red: 'rgb(var(--k-red) / <alpha-value>)',
          blue: 'rgb(var(--k-blue) / <alpha-value>)',
          // Semánticos: un color = un significado (ver src/index.css).
          plan: 'rgb(var(--k-plan) / <alpha-value>)',       // lo previsto
          alerta: 'rgb(var(--k-alerta) / <alpha-value>)',   // atención, aún no es problema
          wbs: 'rgb(var(--k-wbs) / <alpha-value>)',         // estructura: etapas, partidas
          dinero: 'rgb(var(--k-dinero) / <alpha-value>)',   // costo, venta, margen
          // Rellenos sólidos de las barras (texto blanco encima).
          'plan-solido': 'rgb(var(--k-plan-solido) / <alpha-value>)',
          'green-solido': 'rgb(var(--k-green-solido) / <alpha-value>)',
          'red-solido': 'rgb(var(--k-red-solido) / <alpha-value>)',
          'alerta-solido': 'rgb(var(--k-alerta-solido) / <alpha-value>)',
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}