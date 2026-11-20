# AI Doc Assistant

AI Doc Assistant turns a basic chatbot into a personal, source-aware documentation workspace. Upload project files, choose which files an answer can use, and inspect the cited passages behind each response.

## Features

- Upload PDFs, Markdown, text, JSON, and CSV files by browsing or drag and drop.
- Keep original files and extracted text in the `documents` MongoDB collection.
- Ask across the whole library, select specific documents, or switch to a general-knowledge question.
- Get evidence excerpts with inline citations. PDF citations include page numbers.
- Start a focused summary from any file with **Ask about this**.
- Save conversations and document context in the `conversations` collection, then reopen them from the recent chats list.
- Search the library, open stored files, and remove documents.
- Browse the library as a responsive, Pinterest-style reading board with warm beige and violet colors.
- Protect the shared workspace with a password and signed session cookie when `APP_PASSWORD` is configured.

PDF text is extracted during upload. Image-only or scanned PDFs need OCR before they can be searched. Supported files are limited to 8 MB each. The app provides one shared workspace behind a single password, rather than individual user accounts.

## Setup

Use Node.js 20.19+ or 22.12+ for the Vite client.

1. Install the server and client dependencies:

   ```sh
   npm install --prefix server
   npm install --prefix client
   ```

2. Create the server environment file and add your credentials:

   ```sh
   cp server/.env.example server/.env
   ```

   Set `ANTHROPIC_API_KEY` and `MONGODB_URI`. The MongoDB URI must use a database user from Atlas Database Access. URL-encode special characters in its password. `MONGODB_DB` defaults to `ai-doc-assistant`; MongoDB creates the `documents` and `conversations` collections when the first record is saved. For a private local workspace, set `APP_PASSWORD`; production also requires `APP_SESSION_SECRET`.

3. Start the backend and frontend in separate terminals:

   ```sh
   npm --prefix server run dev
   npm --prefix client run dev
   ```

   The API defaults to `http://localhost:8000`, and Vite prints the local frontend address when it starts. Set `VITE_API_URL` if the API runs somewhere else.

## Deploy to Render

The included `render.yaml` builds the Vite client and serves it from the Express web service. To deploy, connect this repository to Render as a Blueprint and provide `MONGODB_URI`, `ANTHROPIC_API_KEY`, and a strong `APP_PASSWORD` when Render prompts for the private values. Render generates `APP_SESSION_SECRET`. The app stores uploaded document text and original files in MongoDB; the `documents` and `conversations` collections are created automatically.

After creating the service, copy its outbound CIDR ranges from Render's **Connect → Outbound** panel into the MongoDB Atlas project's **Network Access** list. The server retries its MongoDB connection while those rules take effect; the header shows when Atlas is connected. Keep Atlas access limited to the Render ranges instead of opening it to all IPs.

Keep database and AI credentials in Render's environment settings, never in the repository. A free Render web service may sleep when idle; its persistent application data remains in MongoDB.

## How answers use documents

The server extracts text into passages and ranks passages against each question. The best matches are sent to Claude as evidence. Answers about uploaded files are instructed to cite those sources and to say when the files do not contain an answer. The app keeps source excerpts with saved messages so they remain available when a conversation is reopened.

## API

- `GET /health` — backend, MongoDB, and AI configuration status.
- `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout` — shared workspace access.
- `GET /api/docs` — list library metadata.
- `GET /api/docs/search?q=...` — search indexed document passages.
- `POST /api/docs/upload` — upload one file using multipart field `file`.
- `GET /api/docs/:id/file` — open the original file.
- `DELETE /api/docs/:id` — remove a file.
- `GET /api/conversations` — list saved conversations.
- `GET /api/conversations/:id` — load messages and citations.
- `POST /api/docs/query` — ask a question with optional `documentIds` and `conversationId`.
