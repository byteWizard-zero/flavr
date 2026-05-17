/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: '#FDFBF7', // Deep cream background 
          dark: '#F7F3E9',    // Slightly darker cream for panels
        },
        orange: {
          burnt: '#C85A32',   // Accent color for primary actions/buttons 
        },
        olive: {
          DEFAULT: '#5F6F52', // Accent color for tags/success states 
          light: '#A9B388',
        },
        charcoal: '#2C3327',  // Soft text color (never use pure black on cream!)
      },
      fontFamily: {
        serif: ['Lora', 'Playfair Display', 'serif'], // Editorial head 
        sans: ['Inter', 'system-ui', 'sans-serif'],    // Body text 
      },
    },
  },
  plugins: [],
}