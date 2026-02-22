# 🛡️ SecureFile

<p align="center">
  <img src="IMGS/image.png" alt="SecureFile Dashboard Overview" width="800">
</p>

**SecureFile** is a robust, production-ready secure file management and sharing platform built with Node.js and Express. It features a modern, responsive interface powered by Bootstrap 5 and is heavily hardened against the OWASP Top 10 vulnerabilities, establishing a reliable, enterprise-grade architecture for secure internal data exchange.

---

##  Platform Highlights

- **Granular Secure Sharing**: Control precisely who has access to your payload with customized, down-to-the-minute temporal expirations.
- **Message & Chat Integration**: Collaborate with internal connections via our live-polling secure chat relay, coupled with direct file sharing over internal DMs.
- **Premium User Experience**: Responsive layout, asynchronous form handling (AJAX), and custom flash toast interactions provide a "SaaS"-level feel globally.
- **Automated Deployments**: Container-first scaling strategy allowing for native 20-second builds via Docker.

##  Security Architecture
SecureFile enforces rigorous constraints and mitigations designed to neutralize advanced exploitation techniques:

- **SQL Injection (SQLi)**: Comprehensive adoption of parameter-bound (`?`) execution mapping for all SQLite3 interactions.
- **Cross-Site Scripting (XSS)**: Templating enforces native HTML escaping mechanisms mitigating maliciously stored script payloads.
- **Malicious File Uploads / LFI**: Deep input stream sanitization mapping file payloads against MIME logic, randomized utilizing server-generated cryptographic UUIDs (Preventing Path Traversal).
- **IDOR Prevention**: Horizontal and vertical structural isolation ensures every CRUD operation absolutely binds against the issuing user’s JWT / Session ID natively on the backend.
- **CSRF Protections**: Non-GET routes mandate verified transmission of Synchronizer Token Patterns attached to authenticated sessions.
- **Sliding-Window Rate Limiting**: Intelligent API throttling across Authentication and globally-available vectors.

---

##  Quick Start Guide

We strongly recommend launching SecureFile via **Docker** to ensure perfect environmental consistency and automatic dependency mapping.

###  Deploying with Docker - (Recommended)

**Prerequisites:** Ensure you have [Docker](https://docs.docker.com/get-docker/) installed. 

1. **Clone the Source**:
   ```bash
   git clone https://github.com/Mohamedattiadev/SecureFile
   cd securefile
   ```

2. **Configure the Environment**:
   Duplicate the provided configuration template to set your environment variables.
   ```bash
   cp .env.example .env
   ```
   *Note: Open your newly created `.env` file and verify `SESSION_SECRET` and `ENCRYPTION_KEY` match your target production entropy.*

3. **Build and Launch**:
   Instruct Docker Compose to compile the NodeJS blueprint and execute the web server daemon in the background:
   ```bash
   docker-compose up -d --build
   ```

4. **Access the Application**:
   Navigate natively to [http://localhost:3000](http://localhost:3000)

   *The Docker layout natively incorporates mounted persistent volumes. This means your core SQLite database instance (`database.sqlite`) and dynamic user assets (`uploads/`, `public/avatars/`) will safely survive container reboots or iterative version pulls.*

   **Useful Docker Maintenance Commands:**
   - Monitor the active server log stream: `docker-compose logs -f`
   - Halt the container instance securely: `docker-compose down`

---

###  Native Deployment (Node.js) - (Instead of Docker)

If you prefer to serve the application natively, ensure you have Node.js (v20+) and local NPM installed.

1. **Clone the Source**:
   ```bash
   git clone https://github.com/Mohamedattiadev/SecureFile
   cd securefile
   ```

2. **Install Modules**:
   ```bash
   npm install
   ```

3. **Initialize Properties**:
   ```bash
   cp .env.example .env
   ```

4. **Execute the Server Daemon**:
   ```bash
   npm start
   ```

---

## Integration Testing Suite
SecureFile ships equipped with a thorough endpoint testing matrix engineered via Jest and Supertest. To validate session stability and access protocols locally:
```bash
npm test
```

For rigorous manual exploitation scenarios evaluating architectural boundary limitations, refer to the included [Manual Testing Guide](MANUAL_TEST_GUIDE.md).

---

## Source Matrix

```text
├── IMGS/                # Associated media files and documentation captures
├── middleware/          # Security logic gates (Auth, CSRF, Role allocations)
├── public/              # Static Frontend assets (CSS maps, core libraries)
├── routes/              # Express API execution paths
├── test/                # Jest / Supertest endpoint specifications
├── uploads/             # Segregated file storage volumes
├── views/               # Dynamic EJS DOM presentation templates
├── app.js               # Primary application configuration and HTTP mapping
├── database.js          # SQLite3 initializations and Schema structure
```

---
*This platform was engineered meticulously to serve as a hardened baseline for secure internal file exchange methodologies.*
