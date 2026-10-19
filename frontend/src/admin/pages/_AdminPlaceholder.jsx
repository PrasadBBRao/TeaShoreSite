/**
 * _AdminPlaceholder.jsx — Shared placeholder for unimplemented admin sections.
 * Used by Orders, Reservations, Tables, Menu, Users, Add-ons, Reports.
 */
export default function AdminPlaceholder({ title, description, icon }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-poppins text-xl font-bold text-[#26372E]">{title}</h2>
        {description && (
          <p className="mt-1 font-sans text-sm text-[#737C72]">{description}</p>
        )}
      </div>

      <div className="rounded-xl border border-[#E4E6DE] bg-[#FFFFFF] px-6 py-16 text-center">
        {icon && (
          <div className="mb-4 flex justify-center text-[#D6D9D0]">
            {icon}
          </div>
        )}
        <p className="font-poppins font-semibold text-[#737C72]">{title}</p>
        <p className="mt-2 font-sans text-sm text-[#737C72]">
          This section will be built in the next implementation step.
        </p>
      </div>
    </div>
  );
}
