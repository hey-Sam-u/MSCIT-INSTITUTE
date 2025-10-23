const form = document.getElementById("studentForm");
const msg = document.getElementById("msg");
const instRaw = localStorage.getItem("mscitinstitute");
if (!instRaw) window.location.href = "/login";
const institute = JSON.parse(instRaw);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.innerText = "";

  const formData = new FormData(form);
  formData.append("institute_id", institute.id);

  try {
    const res = await fetch("/add-student", {
      method: "POST",
      body: formData,
    });

    const result = await res.json();
    if (!res.ok) {
      msg.style.color = "crimson";
      msg.innerText = result.error || "Error adding student";
      return;
    }

    msg.style.color = "green";
    msg.innerText = "Student added successfully!";
    form.reset();
  } catch (err) {
    msg.style.color = "crimson";
    msg.innerText = "Network error";
  }
});
