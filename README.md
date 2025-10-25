# BMS Image Information Extractor

This project is a simple web application that demonstrates how to extract information from an image of a Building Management System (BMS) using a large language model like Gemini.

## Features

*   **Modern UI:** A visually appealing and responsive UI with a dark theme and subtle animations.
*   **Secure:** The Gemini API key is stored securely in a `.env` file.
*   **Robust Backend:** The backend is built with Node.js and Express, and it includes error handling, logging, and CORS.
*   **Modular Code:** The code is organized into a modular and scalable structure.

## How to Use

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/olaam-image-recognition.git
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create a `.env` file** in the root of the project and add your Gemini API key:
    ```
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    ```
4.  **Start the backend server:**
    ```bash
    npm start
    ```
5.  **Navigate to `http://localhost:3000` in your web browser.**

## Docker

To build the Docker image, run the following command in the root of the project:

```bash
docker build -t olaam-image-recognition .
```

To run the container:

```bash
docker run -p 3000:3000 -v $(pwd):/usr/src/app -v /usr/src/app/node_modules --env-file .env olaam-image-recognition
```

```
.olaam-image-recognition/
├── .env
├── .gitignore
├── package.json
├── README.md
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── src/
│   ├── gemini.js
│   └── index.js
└── uploads/
```

*   **`public/`**: The directory that contains the frontend files.
*   **`src/`**: The directory that contains the backend files.