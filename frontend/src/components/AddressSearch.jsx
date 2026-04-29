import { useState } from 'react';

export function AddressSearch({ onSearch, loading }) {
  const [address, setAddress] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (address.trim()) onSearch(address.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        className="input"
        style={{ width: '280px', minWidth: '280px' }}
        placeholder="ex: 10 rue de la Paix, Paris"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !address.trim()}
        className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? 'Recherche…' : 'Analyser'}
      </button>
    </form>
  );
}
