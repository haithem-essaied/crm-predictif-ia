import { useEffect, useState } from "react";

function Leads() {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem("token");

    fetch("http://localhost:3000/api/leads", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(data);
        setLeads(data);
      });
  }, []);

  return (
    <div>
      <h2>Leads</h2>

      {leads.map((lead) => (
        <div key={lead.id}>
          {lead.first_name} - {lead.email}
        </div>
      ))}
    </div>
  );
}

export default Leads;