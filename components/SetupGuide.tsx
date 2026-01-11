
import React from 'react';

const SetupGuide: React.FC = () => {
  const currentOrigin = window.location.origin;

  return (
    <div className="space-y-10 text-slate-700 pb-12 max-w-4xl mx-auto">
      <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-100 mb-12">
        <h2 className="text-3xl font-black mb-2">Setup Assistant</h2>
        <p className="text-indigo-100 font-medium">Follow these steps to link your family's data.</p>
      </div>

      <section className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-3">
          <span className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-lg font-black">1</span>
          Google Cloud Origins
        </h3>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          In your Google Cloud Console under <b>OAuth 2.0 Client IDs</b>, you must add the following URL to your <b>Authorized JavaScript Origins</b> for the login to work:
        </p>
        <div className="bg-slate-50 p-4 rounded-2xl border border-dashed border-indigo-200 font-mono text-sm text-indigo-600 break-all">
          {currentOrigin}
        </div>
      </section>

      <section className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-3">
          <span className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-lg font-black">2</span>
          API Library
        </h3>
        <p className="text-sm text-slate-500 mb-4">Ensure these three APIs are enabled in your library:</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Google Sheets API', 'Google Calendar API', 'Google Drive API'].map(api => (
            <div key={api} className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              {api}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-3">
          <span className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-lg font-black">3</span>
          Sheet Columns (Tab: "Recipes")
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-4 font-black uppercase tracking-widest text-slate-400">Column</th>
                <th className="p-4 font-black uppercase tracking-widest text-slate-400">Header Name</th>
                <th className="p-4 font-black uppercase tracking-widest text-slate-400">Content Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { col: 'A', head: 'Name', ex: 'Taco Tuesday' },
                { col: 'B', head: 'Ingredients', ex: 'Shells, Beef, Salsa' },
                { col: 'C', head: 'ImageURL', ex: 'https://drive.google...' },
                { col: 'D', head: 'Tags', ex: 'Mexican, Dinner' },
                { col: 'E', head: 'Instructions', ex: 'Brown meat || Fill shells' },
                { col: 'F', head: 'ID', ex: '1723456789' },
              ].map(row => (
                <tr key={row.col}>
                  <td className="p-4 font-black text-indigo-600">{row.col}</td>
                  <td className="p-4 font-bold text-slate-800">{row.head}</td>
                  <td className="p-4 text-slate-500 italic">{row.ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="p-8 bg-amber-50 rounded-[2.5rem] border border-amber-100 flex gap-6 items-start">
        <div className="w-14 h-14 bg-amber-400 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-100">
           <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <div>
          <h4 className="font-black text-amber-900 text-lg mb-1">Important: File Scopes</h4>
          <p className="text-sm text-amber-800 leading-relaxed opacity-80">
            This app uses the <b>drive.file</b> scope. This means it can only see and edit files it created itself. It cannot browse your entire Google Drive, ensuring your personal privacy while still allowing for recipe photo management.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SetupGuide;
