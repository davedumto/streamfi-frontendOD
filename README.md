[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/MIT)

# StreamFi Frontend

A modern streaming platform built with Next.js, Livepeer, and Web3 technologies.

## 🚀 Twitch-Style Auto-Start Streaming Feature

### Stream Key Flow (Like Twitch)

We've implemented a Twitch-style streaming flow where users get stream keys immediately:

**Twitch-Style Flow:**
1. User gets stream key immediately (upon signup/first use)
2. User copies stream key to OBS Studio
3. User starts streaming in OBS Studio
4. Stream automatically goes live when OBS Studio connects

### How It Works

1. **Wallet as Identifier**: Each user is identified by their wallet address
2. **Get Stream Key**: Users get a stream key immediately when they first try to stream
3. **OBS Studio Setup**: User copies stream key to OBS Studio streaming settings
4. **Start Streaming**: User clicks "Start Streaming" in OBS Studio
5. **Auto-Detection**: System automatically detects OBS Studio connection and goes live

### API Endpoints

- `POST /api/streams/start` - Creates user account if needed, creates stream key, checks OBS Studio connection, auto-starts stream
- `DELETE /api/streams/start` - Stops the stream
- `POST /api/streams/create` - Manual stream creation (for advanced users)
- `GET /api/streams/[wallet]` - Get stream data for specific wallet address

### Features

- ✅ **Wallet-based User System**: Each wallet address is a unique user identifier
- ✅ **Automatic User Creation**: New users are created automatically when they first stream
- ✅ **Automatic Stream Key Generation**: Stream keys are created on-demand (Twitch-style)
- ✅ **Auto-detection**: System detects when OBS Studio connects
- ✅ **No Manual Start**: Stream goes live automatically when OBS Studio connects
- ✅ **Persistent Stream Keys**: Stream keys stay with user's wallet address
- ✅ **Dynamic Wallet Support**: Users can change wallet addresses for testing

# StreamFi

## Overview

StreamFi is a decentralized live-streaming platform that empowers content creators and viewers through blockchain technology. Our mission is to create a fair, transparent, and user-driven streaming ecosystem where creators retain full ownership of their content and earnings. 

It is designed for content creators and gamers that empowers users with Web3-native monetization, eliminating middlemen through direct crypto tipping and blockchain-based interactions, while ensuring transparency, security, and censorship resistance in content creation and distribution.

### 🌍 Ecosystem and Integrations

- Integrates with **StarkNet** for blockchain scalability.
- Engages with **Worldcoin** for user identity verification.

## 🏗 Project Structure

- **Frontend**: Built with React, Next.js (Web), Flutter (Mobile).
- **Backend**: Node.js, FastAPI, GraphQL.
- **Smart Contracts**: Cairo (StarkNet).
- **Storage**: IPFS/Filecoin integration for decentralized content storage.

## 🔧 Installation & Setup

To set up the project locally:

```bash
# Clone the repository
git clone https://github.com/StreamFi-x/streamfi-frontend.git
cd streamfi

# Install dependencies
npm install

# Start the development server
npm run dev
```

If you encounter installation issues, try these steps:

```bash
npm cache clean --force
rm -rf node_modules
rm package-lock.json
npm install
```

## 🛠 Branch Naming Convention

We follow a structured branch naming format:

```
[fix|feat|chore]-[issue-number]-[short-description]
```

Example:

```
feat-23-livepeer-integration
fix-45-streaming-bug
```

## 🤝 Contributing

We are always excited to welcome passionate developers and contributors to help shape the future of StreamFi. Whether you're improving existing features, fixing bugs, or bringing innovative ideas to the table, your contributions are invaluable. To get started, check out our [📜 Contribution Guide](https://github.com/StreamFi-x/streamfi-frontend/blob/main/CONTRIBUTING.md) for detailed instructions on how to contribute effectively.

## 💬 Community & Support

- Join our [Telegram](https://t.me/+slCXibBFWF05NDQ0) for discussions and support.

## 📜 License

This project is licensed under the MIT License.
