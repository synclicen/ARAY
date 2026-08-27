import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // PURPLE HAZE — primary brand color
        purple: {
          haze: {
            50: '#F4F0FA',
            100: '#E6DCF2',
            200: '#CDB8E4',
            300: '#B493D6',
            400: '#9B6FC8',
            500: '#7B61A8',
            600: '#654E8E',
            700: '#4F3C74',
            800: '#392B5A',
            900: '#241A40',
            950: '#120D24'
          }
        },
        // GOLD — luxury accent
        gold: {
          50: '#FBF6E6',
          100: '#F6ECC2',
          200: '#EDD985',
          300: '#E4C647',
          400: '#D4AF37',
          500: '#B8932B',
          600: '#8C701F',
          700: '#5F4C14',
          800: '#322808',
          900: '#1A1404'
        },
        // SILVER — secondary metallic
        silver: {
          50: '#F8F8FA',
          100: '#EDEDF1',
          200: '#DCDCE3',
          300: '#C0C0C8',
          400: '#A8A8B2',
          500: '#909099',
          600: '#74747C',
          700: '#56565C',
          800: '#38383C',
          900: '#1E1E22'
        },
        // Surface system (dark premium)
        surface: {
          base: '#0F0B1A',
          raised: '#1A1330',
          elevated: '#241A40',
          overlay: '#2E2150'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        'glow-purple': '0 0 24px rgba(123, 97, 168, 0.45)',
        'glow-gold': '0 0 16px rgba(212, 175, 55, 0.55)',
        'card': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      },
      backgroundImage: {
        'gradient-purple-gold': 'linear-gradient(135deg, #7B61A8 0%, #B8932B 100%)',
        'gradient-purple-dark': 'linear-gradient(180deg, #241A40 0%, #0F0B1A 100%)',
        'gradient-silver': 'linear-gradient(135deg, #DCDCE3 0%, #A8A8B2 100%)'
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'glow-pulse': 'glowPulse 2.4s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 16px rgba(123, 97, 168, 0.35)' },
          '50%': { boxShadow: '0 0 32px rgba(123, 97, 168, 0.65)' }
        }
      }
    }
  },
  plugins: []
}

export default config
