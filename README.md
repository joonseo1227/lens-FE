# LensCorrect

**Fix Lens Distortion Instantly.**

🔗 **Live Demo:** [https://lens-fe.vercel.app/](https://lens-fe.vercel.app/)

LensCorrect is a professional-grade web application that allows you to correct barrel and pincushion lens distortion directly in your browser. Powered by WebGL, it delivers real-time performance with zero latency, ensuring your photos look perfect every time.

## 🚀 Features

-   **WebGL Powered**: Leverages the power of your GPU for hardware-accelerated image manipulation using custom fragment shaders.
-   **100% Local Processing**: Your images never leave your device. All processing happens within your browser's sandboxed environment, ensuring complete privacy. No uploads, no waiting.
-   **Real-time Correction**: Instantly see changes as you adjust the distortion using the slider.
-   **Dual Modes**:
    -   **Standard Correction**: Ideal for fixing single photos with barrel or pincushion distortion.
    -   **Panorama Editor**: Specialized tools for tweaking panoramic images.

## 🛠 Tech Stack

Built with the latest modern web technologies:

-   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
-   **Library**: [React 19](https://react.dev/)
-   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
-   **Graphics**: WebGL (Custom Shaders)
-   **Language**: TypeScript

## 📐 How It Works

LensCorrect implements a mathematical model for radial distortion correction using a custom WebGL shader.

The core transformation is defined by:

$$r_{new} = r_{old} * (1 + k * r_{old}^2)$$

Where:
-   `r` is the radial distance from the center of the image.
-   `k` is the distortion coefficient (controlled by the user slider).

-   **Positive `k`**: Corrects pincushion distortion.
-   **Negative `k`**: Corrects barrel distortion.

## 🏁 Getting Started

Follow these steps to run the project locally.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/joonseo1227/lens.git
    cd lens
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    ```

4.  **Open the app**
    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📂 Project Structure

```
lens/
├── app/
│   ├── components/      # UI Components (Header, LensCorrector, etc.)
│   ├── how-it-works/    # Documentation page
│   ├── panorama/        # Panorama editor page
│   ├── layout.tsx       # Main app layout
│   └── page.tsx         # Home page (Correction tool)
├── public/              # Static assets
└── ...config files
```

## 📄 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.
You are free to use, share, and adapt the material for non-commercial purposes, as long as you provide attribution.

See the [LICENSE](LICENSE) file for details.
