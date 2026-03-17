"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

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

type PartnerFormData = {
  name: string;
  role: string;
  category: typeof CATEGORIES[number];
  contactEmail: string;
  contactName: string;
  geographicScope: string;
  defaultSLADays: string;
  notes: string;
};

const EMPTY_FORM: PartnerFormData = {
  name: "",
  role: "",
  category: "other",
  contactEmail: "",
  contactName: "",
  geographicScope: "",
  defaultSLADays: "",
  notes: "",
};

export default function PartnersPage() {
  const partners = useQuery(api.vendors.list, {});
  const createPartner = useMutation(api.vendors.create);
  const updatePartner = useMutation(api.vendors.update);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<PartnerFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<PartnerFormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (partners === undefined) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-gray-400 py-8 text-center">Loading partners...</div>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createPartner({
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
      setFormData(EMPTY_FORM);
      setShowForm(false);
    } catch (error) {
      console.error("Failed to create partner:", error);
    }
    setIsSubmitting(false);
  }

  function startEdit(partner: NonNullable<typeof partners>[number]) {
    const primary = partner.contacts.find((c) => c.isPrimary) ?? partner.contacts[0];
    setEditingId(partner._id);
    setEditData({
      name: partner.name,
      role: partner.role,
      category: partner.category,
      contactEmail: primary?.email ?? "",
      contactName: primary?.name ?? "",
      geographicScope: partner.geographicScope ?? "",
      defaultSLADays: partner.defaultSLADays?.toString() ?? "",
      notes: partner.notes ?? "",
    });
  }

  async function handleUpdate(e: React.FormEvent, partnerId: string) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const partner = partners?.find((p) => p._id === partnerId);
      const otherContacts = partner?.contacts.filter((c) => !c.isPrimary) ?? [];
      const primaryContact = editData.contactEmail
        ? { email: editData.contactEmail, name: editData.contactName || undefined, isPrimary: true as const }
        : null;
      const contacts = primaryContact ? [primaryContact, ...otherContacts] : otherContacts;

      await updatePartner({
        id: partnerId as Id<"vendors">,
        name: editData.name,
        role: editData.role,
        category: editData.category,
        contacts,
        geographicScope: editData.geographicScope || undefined,
        defaultSLADays: editData.defaultSLADays ? parseInt(editData.defaultSLADays) : undefined,
        notes: editData.notes || undefined,
      });
      setEditingId(null);
    } catch (error) {
      console.error("Failed to update partner:", error);
    }
    setIsSubmitting(false);
  }

  async function toggleStatus(partner: NonNullable<typeof partners>[number]) {
    const newStatus = partner.status === "active" ? "inactive" : "active";
    await updatePartner({
      id: partner._id as Id<"vendors">,
      status: newStatus,
    });
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Partner Directory</h1>
          <p className="text-sm text-gray-500 mt-1">
            {partners.length} partner{partners.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          {showForm ? "Cancel" : "Add Partner"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Partner Name *</label>
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
                placeholder="contact@partner.com"
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
            {isSubmitting ? "Creating..." : "Create Partner"}
          </button>
        </form>
      )}

      {partners.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center text-gray-400">
          No partners yet. Add partners manually or they will be auto-detected from inbound emails.
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((partner) => (
            <div
              key={partner._id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm"
            >
              {editingId === partner._id ? (
                <form onSubmit={(e) => handleUpdate(e, partner._id)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Partner Name *</label>
                      <input
                        required
                        type="text"
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Role *</label>
                      <input
                        required
                        type="text"
                        value={editData.role}
                        onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Category *</label>
                      <select
                        value={editData.category}
                        onChange={(e) => setEditData({ ...editData, category: e.target.value as typeof CATEGORIES[number] })}
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
                        value={editData.contactEmail}
                        onChange={(e) => setEditData({ ...editData, contactEmail: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Contact Name</label>
                      <input
                        type="text"
                        value={editData.contactName}
                        onChange={(e) => setEditData({ ...editData, contactName: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Geographic Scope</label>
                      <input
                        type="text"
                        value={editData.geographicScope}
                        onChange={(e) => setEditData({ ...editData, geographicScope: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Default SLA (business days)</label>
                      <input
                        type="number"
                        value={editData.defaultSLADays}
                        onChange={(e) => setEditData({ ...editData, defaultSLADays: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Notes</label>
                      <input
                        type="text"
                        value={editData.notes}
                        onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                        className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-4 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{partner.name}</span>
                      {categoryBadge(partner.category)}
                      {statusBadge(partner.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      {partner.geographicScope && (
                        <span className="text-xs text-gray-400">{partner.geographicScope}</span>
                      )}
                      <button
                        onClick={() => startEdit(partner)}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleStatus(partner)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          partner.status === "active"
                            ? "text-gray-500 hover:text-red-600 hover:bg-red-50"
                            : "text-gray-500 hover:text-green-600 hover:bg-green-50"
                        }`}
                      >
                        {partner.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">{partner.role}</div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    {partner.contacts.map((c, i) => (
                      <span key={i}>
                        {c.name ? `${c.name} — ` : ""}{c.email}
                        {c.isPrimary && <span className="ml-1 text-blue-500">(primary)</span>}
                      </span>
                    ))}
                    {partner.defaultSLADays && (
                      <span>SLA: {partner.defaultSLADays} days</span>
                    )}
                    <span>Active sites: {partner.activeSiteCount}</span>
                  </div>
                  {partner.notes && (
                    <div className="text-xs text-gray-400 mt-2">{partner.notes}</div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
