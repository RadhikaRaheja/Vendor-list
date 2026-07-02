// Change this string to your exact Google Apps Script Web App URL
const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

// Global storage arrays
let masterVendors = [];
let postingLogs = [];

document.addEventListener("DOMContentLoaded", () => {
    // Set initial date selector input to today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("dash-date").value = today;

    // Fetch initial data
    fetchAllData();

    // Event Listeners
    document.getElementById("dash-date").addEventListener("change", renderDashboard);
    document.getElementById("vendor-form").addEventListener("submit", handleVendorSubmit);
    document.getElementById("clear-form-btn").addEventListener("click", clearVendorForm);
});

async function fetchAllData() {
    try {
        // Fetch Vendors and Logs simultaneously
        const [vendorRes, logRes] = await Promise.all([
            fetch(`${API_URL}?action=getVendors`),
            fetch(`${API_URL}?action=getLogs`)
        ]);

        const vendorJson = await vendorRes.json();
        const logJson = await logRes.json();

        if (vendorJson.status === "success") masterVendors = vendorJson.data;
        if (logJson.status === "success") postingLogs = logJson.data;

        renderMasterVendors();
        renderDashboard();
    } catch (err) {
        console.error("Critical error syncing with backend architecture:", err);
        alert("Failed to load records from Google Sheet backend.");
    }
}

function renderMasterVendors() {
    const tbody = document.getElementById("master-vendor-tbody");
    tbody.innerHTML = "";

    masterVendors.forEach(vendor => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${vendor["Vendor Name"] || ""}</strong><br><small><a href="${vendor["Website"] || '#'}" target="_blank">${vendor["Website"] || ''}</a></small></td>
            <td>${vendor["Mobile Number"] || ""}</td>
            <td>${vendor["Notes"] || ""}</td>
            <td><button class="btn-edit" onclick="populateVendorForm('${vendor["Vendor ID"]}')">Modify</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderDashboard() {
    const targetDate = document.getElementById("dash-date").value;
    const tbody = document.getElementById("dashboard-tbody");
    tbody.innerHTML = "";

    masterVendors.forEach(vendor => {
        // Search if a log exists for this vendor on this specific date
        const matchLog = postingLogs.find(log => {
            let logDate = log["Date"];
            // Normalize potential Date objects to ISO string dates
            if (logDate && logDate.includes("T")) logDate = logDate.split("T")[0];
            return log["Vendor ID"] == vendor["Vendor ID"] && logDate == targetDate;
        });

        const isChecked = matchLog ? (matchLog["Posting Done"] === true || matchLog["Posting Done"] === "true") : false;
        const timeLogged = isChecked && matchLog ? matchLog["Timestamp"] : "";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${vendor["Vendor Name"]}</td>
            <td><a href="${vendor["Website"] || '#'}" target="_blank">Visit Site</a></td>
            <td>
                <label class="checkbox-container">
                    <input type="checkbox" ${isChecked ? "checked" : ""} onchange="handlePostToggle('${vendor["Vendor ID"]}', this.checked)">
                    <span class="${isChecked ? 'status-done' : ''}">${isChecked ? 'Completed' : 'Pending'}</span>
                </label>
            </td>
            <td><small>${timeLogged || "--"}</small></td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleVendorSubmit(e) {
    e.preventDefault();
    
    const vendorId = document.getElementById("vendor-id").value;
    const name = document.getElementById("vendor-name").value;
    const website = document.getElementById("vendor-website").value;
    const mobile = document.getElementById("vendor-mobile").value;
    const notes = document.getElementById("vendor-notes").value;

    const payload = {
        action: "saveVendor",
        vendorId: vendorId || null,
        name: name,
        website: website,
        mobile: mobile,
        notes: notes
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === "success") {
            clearVendorForm();
            await fetchAllData();
        }
    } catch (err) {
        console.error("Failed saving profile info:", err);
    }
}

async function handlePostToggle(vendorId, isChecked) {
    const targetDate = document.getElementById("dash-date").value;
    
    const payload = {
        action: "togglePost",
        vendorId: vendorId,
        date: targetDate,
        postingDone: isChecked
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === "success") {
            // Re-fetch database values to accurately show server timestamps
            await fetchAllData();
        }
    } catch (err) {
        console.error("Failed toggling posting log:", err);
    }
}

function populateVendorForm(vendorId) {
    const vendor = masterVendors.find(v => v["Vendor ID"] == vendorId);
    if (!vendor) return;

    document.getElementById("vendor-id").value = vendor["Vendor ID"];
    document.getElementById("vendor-name").value = vendor["Vendor Name"] || "";
    document.getElementById("vendor-website").value = vendor["Website"] || "";
    document.getElementById("vendor-mobile").value = vendor["Mobile Number"] || "";
    document.getElementById("vendor-notes").value = vendor["Notes"] || "";
    
    document.getElementById("vendor-name").focus();
}

function clearVendorForm() {
    document.getElementById("vendor-id").value = "";
    document.getElementById("vendor-form").reset();
}
