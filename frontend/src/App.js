import { useState } from "react";
import Login from "./pages/Login";
import Leads from "./pages/Leads";
import ImportPage from "./pages/ImportPage";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div>
      <Leads />
      <hr />
      <ImportPage />
    </div>
  );
}

export default App;