import axios from "axios";

// All requests go to /api, which Vite proxies to the Express server.
const client = axios.create({ baseURL: "/api", timeout: 180_000 });

// Turn API errors into plain Error objects with a readable message.
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.message ||
      (error.code === "ECONNABORTED" ? "The request timed out" : null) ||
      (!error.response ? "Cannot reach the DSAForge server. Is the backend running?" : error.message);
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    wrapped.code = error.response?.data?.code;
    return Promise.reject(wrapped);
  }
);

export default client;
