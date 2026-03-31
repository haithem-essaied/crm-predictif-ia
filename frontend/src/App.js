import { useEffect } from "react";

function App() {
  useEffect(() => {
    fetch("http://localhost:3000/")
      .then(res => res.text())
      .then(console.log);
  }, []);

  return <h1>CRM Frontend ✅</h1>;
}

export default App;