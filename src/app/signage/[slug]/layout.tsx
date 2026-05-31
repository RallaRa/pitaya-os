export default function SignageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black m-0 p-0">
      {children}
    </div>
  );
}
