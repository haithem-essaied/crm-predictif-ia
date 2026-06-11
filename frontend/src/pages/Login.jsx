import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRoleHome } from "../utils/auth";
import "./Login.css";

function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");
    try {
      const res = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.token) {
        localStorage.setItem("token", data.token);
        navigate(getRoleHome());
      } else {
        setError(data.message || "Email ou mot de passe incorrect");
      }
    } catch {
      setError("Impossible de contacter le serveur");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">◈</span>
          <span className="login-logo-text">CRM <span className="login-logo-ai">IA</span></span>
        </div>
        <h2 className="login-title">Connexion</h2>
        <p className="login-sub">Sierra Bravo Intelligence</p>

        {error && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label>Email</label>
          <input
            type="email"
            placeholder="votre@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="login-field">
          <label>Mot de passe</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <button className="login-btn" onClick={handleLogin}>
          Se connecter
        </button>
      </div>
    </div>
  );
}

export default Login;
