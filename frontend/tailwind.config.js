/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          gold:        '#0072CE',
          'gold-light':'#2B95E8',
          navy:        '#0A2540',
          'navy-deep': '#061A2D',
          'navy-mid':  '#0F3A5F',
          cream:       '#F5F8FC',
          maroon:      '#0072CE',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
