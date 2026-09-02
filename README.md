## Olaam Image Recognition – Chiller Performance Diagnosis

This project is a small full‑stack Node.js web application that uses a Yolo-Auto hosted vision model to read data from images of Building Management System (BMS) / chiller control panels and diagnose chiller performance.

Users upload one or more panel images and provide basic inventory information (chiller capacity and full‑load kW). The backend sends the images to Yolo-Auto with a function‑calling schema that extracts key operating parameters. The frontend then combines the extracted values, runs engineering calculations (tons, kW/ton, ARI baseline, savings, etc.), and displays a performance summary.

---

## Features

- **Image‑based data extraction**
  - Upload one or more images of a chiller’s control panel.
  - Yolo-Auto (`qwen3.8-27b`) is prompted to:
    - Recognize one or more assets (multiple chillers per image supported).
    - Extract numeric parameters such as:
      - `chiller_capacity_tons`
      - `full_load_amps_percent`
      - `input_kw`
      - `chilled_liquid_leaving_temp_f`
      - `chilled_liquid_entering_temp_f`
      - `condenser_liquid_leaving_temp_f`
      - `condenser_liquid_entering_temp_f`
      - `discharge_superheat_f`
  - Extraction is implemented via OpenAI‑compatible tool calling with a `get_asset_information` tool.

- **Multi‑asset support**
  - If the model returns multiple `assets` for a single image, the backend aggregates numeric properties across those assets (sums each numeric field).
  - The frontend further aggregates results across all uploaded images.

- **Chiller performance calculations**
  - Uses user‑provided:
    - **Chiller Capacity (Tons)**.
    - **Chiller Full Load (kW)** (auto‑defaults to 60% of capacity if omitted).
  - Computes key derived metrics:
    - Chilled water **ΔT**.
    - Flow in GPM.
    - Calculated **tons**.
    - Condenser water **ΔT**.
    - Input power and **actual kW/ton**.
    - Percent capacity.
    - **Target kW/ton per AHRI** (from tonnage‑dependent ARI lookup tables).
    - **Inefficiency (%)** relative to AHRI baseline.
    - **kW savings** potential at design.

- **Modern single‑page UI**
  - Clean layout with two main columns:
    - **Inventory Inputs**: capacity, full‑load kW, file upload, image preview.
    - **Parameters Recognized / Diagnosis**: extracted parameters and calculated performance metrics.
  - Drag‑and‑drop‑style file input with preview thumbnails.
  - Loader and basic error messaging around the extraction call.

---

## Project Structure

- `package.json` – Node.js project definition and dependencies.
- `src/index.js` – Express server:
  - Serves static frontend from `public`.
  - Exposes:
    - `GET /` – Main web UI.
    - `GET /health` – Simple health check.
    - `POST /extract` – Image upload + extraction endpoint:
      - Accepts `multipart/form-data` with:
        - `images` – one or more image files.
        - `chillerCapacity`, `chillerFullLoad` – numeric inputs.
      - Uses `multer` to store uploads in `uploads/`.
      - Calls `extractInformation` in `src/yolo.js` for each image.
      - Aggregates multi‑asset responses into a single numeric summary per image.
- `src/yolo.js` – Yolo-Auto integration:
  - Calls the OpenAI‑compatible `POST {YOLO_BASE_URL}/chat/completions` endpoint with `YOLO_API_KEY` (no SDK; uses Node's built‑in `fetch`).
  - Sends a `get_asset_information` tool schema with `tool_choice` pinned to that function, so the model always answers with structured arguments.
  - Reads the uploaded image, encodes to base64, and sends prompt + image as a `data:` URL content part.
  - Parses the tool call arguments and returns them as structured JSON.
  - Deletes the temporary uploaded file once processing is complete.
- `public/index.html` – Main HTML shell for the SPA UI.
- `public/script.js` – Frontend behavior:
  - Handles image selection & preview.
  - Manages inventory inputs.
  - Calls the backend `/extract` endpoint.
  - Aggregates extracted data and performs performance calculations.
  - Renders both raw parameters and diagnosis tables.
- `.env` – Environment variables (not committed) such as API key and port.

> Note: In the current `public/script.js`, the backend URL is hard‑coded to the deployed endpoint `https://image-recognition.deltaenergyplus.com/extract`. For local development, you may want to adjust this to your local server (see below).

---

## Technology Stack

- **Runtime / Server**
  - Node.js
  - Express
  - Multer for file uploads
  - CORS
  - Nodemon for local development reloading

- **AI / LLM**
  - Yolo-Auto OpenAI‑compatible API (`https://yolo-auto.com/v1`, model `qwen3.8-27b`)
  - Tool calling to a custom `get_asset_information` tool.

- **Frontend**
  - Vanilla HTML/CSS/JavaScript (no framework).
  - Fetch API for calling the backend.

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js** (LTS recommended).
- A valid **Yolo-Auto API key** with access to the `qwen3.8-27b` model.

### Installation

```bash
cd OLAAM-IMAGE-RECOGNITION
npm install
```

### Configuration

Create a `.env` file in the project root:

```bash
YOLO_API_KEY=your_yolo_auto_api_key_here
YOLO_BASE_URL=https://yolo-auto.com/v1   # optional, this is the default
YOLO_MODEL=qwen3.8-27b                   # optional, this is the default
PORT=4914                                # optional, defaults to 4914 if omitted
```

The server will listen on `http://localhost:<PORT>` and serve the UI from `public/`.

### Running the Server

```bash
npm start
```

This runs `nodemon src/index.js`. You should see a log message like:

```text
Server is running on http://localhost:4914
```

Then open the URL in your browser.

> **Note:** For purely local development, you may want `public/script.js` to call your local backend instead of the production endpoint. Change:
>
> ```js
> fetch('https://image-recognition.deltaenergyplus.com/extract', { ... })
> ```
>
> to:
>
> ```js
> fetch('/extract', { ... })
> ```
>
> so the frontend will talk directly to your local Express server.

---

## Using the Application

1. **Start the server** with `npm start`.
2. **Open the UI** in a browser at `http://localhost:<PORT>` (4914 by default).
3. **Enter inventory inputs**:
   - `Chiller Capacity (Tons)` – required.
   - `Chiller Full Load (kW)` – optional; if left blank, the UI will default it to 60% of the capacity.
4. **Upload one or more images** of the chiller control panel.
   - You will see thumbnail previews of the uploaded images.
5. Click **“Analyze Performance”**.
   - The UI sends the images + inventory inputs to `/extract`.
   - The backend calls Yolo-Auto to extract asset parameters.
   - The frontend aggregates the returned data and computes:
     - Input parameters (as recognized from the image).
     - Diagnosis metrics (inefficiency %, kW savings, etc.).
6. Review the **Parameters Recognized** and **Diagnosis** tables.

If extraction fails or no data can be parsed from the images, the app returns an error message to the UI.

---

## API Endpoints

- **`GET /`**
  - Serves `public/index.html`.

- **`GET /health`**
  - Returns `{ "status": "ok" }` for monitoring / health checks.

- **`POST /extract`**
  - **Content type:** `multipart/form-data`.
  - **Fields:**
    - `images` – one or more image files (`image/*`).
    - `chillerCapacity` – chiller capacity in tons (string/number).
    - `chillerFullLoad` – full‑load kW (string/number).
  - **Response:**
    - JSON array where each element is a numeric summary object derived from the model’s tool‑call response for that image.
    - The frontend further aggregates and presents the data; consumers could also call this endpoint directly for programmatic use.

---

## Error Handling & Logging

- **Server logging**
  - A simple logger middleware prints timestamp, HTTP method, and URL for each request:
    - `"[2025-..] POST /extract"`, etc.

- **Error handling**
  - If no files are provided to `/extract`, the server responds with `400` and an error JSON.
  - Unexpected exceptions during extraction return a `500` with `{ error: error.message }`.
  - Global error‑handling middleware ensures unhandled errors surface as a `500` response.

---

## Notes & Limitations

- Image extraction quality and robustness depend heavily on:
  - Image clarity, resolution, and angle.
  - The model’s ability to correctly interpret the specific control panel layout.
- ARI tables in the frontend are hard‑coded for three capacity bands:
  - `< 500 tons`, `500–1500 tons`, and `> 1500 tons`.
- The diagnosis logic is **client‑side** (in `public/script.js`):
  - Backend only returns extracted parameters from the model.
  - This makes it easy to iterate on the performance calculations without changing the API, but it also means:
    - Consumers calling `/extract` directly will have to implement their own calculations if they want the same diagnosis values.

# BMS Image Information Extractor

This project is a simple web application that demonstrates how to extract information from an image of a Building Management System (BMS) using a large language model served by Yolo-Auto.

## Features

*   **Modern UI:** A visually appealing and responsive UI with a dark theme and subtle animations.
*   **Secure:** The Yolo-Auto API key is stored securely in a `.env` file.
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
3.  **Create a `.env` file** in the root of the project and add your Yolo-Auto API key:
    ```
    YOLO_API_KEY=YOUR_YOLO_AUTO_API_KEY
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
│   ├── yolo.js
│   └── index.js
└── uploads/
```

*   **`public/`**: The directory that contains the frontend files.
*   **`src/`**: The directory that contains the backend files.