"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

function categoryBadge(category: string) {
  const colors: Record<string, string> = {
    lidar: "bg-purple-100 text-purple-700",
    inspection: "bg-blue-100 text-blue-700",
    permitting: "bg-yellow-100 text-yellow-700",
    zoning: "bg-orange-100 text-orange-700",
    construction: "bg-teal-100 text-teal-700",
    it_cabling: "bg-indigo-100 text-indigo-700",
    architecture: "bg-pink-100 text-pink-700",
    legal: "bg-red-100 text-red-700",
    insurance: "bg-green-100 text-green-700",
    other: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[category] ?? "bg-gray-100"}`}>
      {category.replace(/_/g, " ")}
    </span>
  );
}

function statusBadge(status: string) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
      status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
    }`}>
      {status}
    </span>
  );
}

const CATEGORIES = [
  "lidar", "inspection", "permitting", "zoning", "construction",
  "it_cabling", "architecture", "legal", "insurance", "other",
] as const;

export default function VendorsPage() {
  const vendors = useQuery(api.vendors.list, {});
  const createVendor = useMutation(api.vendors.create);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    category: "other" as typeof CATEGORIES[number],
    contactEmail: "",
    contactName: "",
    geographicScope: "",
    defaultSLADays: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (vendors === undefined) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Loading vendors...</div>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createVendor({
        name: formData.name,
        role: formData.role,
        category: formData.category,
        contacts: formData.contactEmail ? [{
          email: formData.contactEmail,
          name: formData.contactName || undefined,
          isPrimary: true,
        }] : [],
        geographicScope: formData.geographicScope || undefined,
        defaultSLADays: formData.defaultSLADays ? parseInt(formData.defaultSLADays) : undefined,
        notes: formData.notes || undefined,
      });
      setFormData({
        name: "", role: "", category: "other", contactEmail: "",
        contactName: "", geographicScope: "", defaultSLADays: "", notes: "",
      });
      setShowForm(false);
    } catch (error) {
      console.error("Failed to create vendor:", error);
    }
    setIsSubmitting(false);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Vendor Directory</h1>
          <p className="text-sm text-gray-500 mt-1">
            {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showForm ? "Cancel" : "Add Vendor"}
        </button>
      </div>

      {/* Add Vendor Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vendor Name *</label>
              <input
                required
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Worksmith"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role *</label>
              <input
                required
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Building inspection coordination"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as typeof CATEGORIES[number] })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Primary Contact Email</label>
              <input
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="contact@vendor.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Contact Name</label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Steve Hehl"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Geographic Scope</label>
              <input
                type="text"
                value={formData.geographicScope}
                onChange={(e) => setFormData({ ...formData, geographicScope: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="National, TX, etc."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Default SLA (business days)</label>
              <input
                type="number"
                value={formData.defaultSLADays}
                onChange={(e) => setFormData({ ...formData, defaultSLADays: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="5"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional context"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Creating..." : "Create Vendor"}
          </button>
        </form>
      )}

      {/* Vendor List */}
      {vendors.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center text-gray-400">
          No vendors yet. Add vendors manually or run the seed mutation from the Convex dashboard.
        </div>
      ) : (
        <div className="space-y-3">
          {vendors.map((vendor) => (
            <div
              key={vendor._id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{vendor.name}</span>
                  {categoryBadge(vendor.category)}
                  {statusBadge(vendor.status)}
                </div>
                {vendor.geographicScope && (
                  <span className="text-xs text-gray-400">{vendor.geographicScope}</span>
                )}
              </div>
              <div className="text-sm text-gray-600 mb-2">{vendor.role}</div>
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {vendor.contacts.map((c, i) => (
                  <span key={i}>
                    {c.name ? `${c.name} — ` : ""}{c.email}
                    {c.isPrimary && <span className="ml-1 text-blue-500">(primary)</span>}
                  </span>
                ))}
                {vendor.defaultSLADays && (
                  <span>SLA: {vendor.defaultSLADays} days</span>
                )}
                <span>Active sites: {vendor.activeSiteCount}</span>
              </div>
              {vendor.notes && (
                <div className="text-xs text-gray-400 mt-2">{vendor.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
