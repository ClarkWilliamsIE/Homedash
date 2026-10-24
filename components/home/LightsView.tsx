// components/home/LightsView.tsx
import React from 'react';
import { HOME } from '../../home.config';
import { callService, useEntities, useEntity } from '../../lib/hass';
import { Card, LightRow, Switch, lightStatus, toggleLight } from './controls';
import { HomeIcons } from './icons';

const friendly = (name?: string) => (name || '').replace(/^tz3210.*$/i, 'Light');

const RoomCard: React.FC<{ name: string; entityId: string }> = ({ name, entityId }) => {
  const room = useEntity(entityId);
  const members: string[] = Array.isArray(room?.attributes.entity_id) ? room!.attributes.entity_id : [];
  const memberStates = useEntities(members);
  const on = room?.state === 'on';
  return (
    <Card
      title={name}
      action={
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400">{lightStatus(room)}</span>
          <Switch on={on} onToggle={() => toggleLight(entityId)} label={`${name} on or off`} />
        </div>
      }
    >
      {members.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {members.map((id, i) => (
            <LightRow key={id} entityId={id} entity={memberStates[i]} name={friendly(memberStates[i]?.attributes.friendly_name) || id} />
          ))}
        </div>
      ) : (
        <LightRow entityId={entityId} entity={room} name={name} large />
      )}
    </Card>
  );
};

const LightsView: React.FC = () => {
  const party = useEntity(HOME.partyMode);
  const anyOn = useEntities(HOME.rooms.map(r => r.entity)).some(e => e?.state === 'on');

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight mr-auto">Lights</h2>
        <button
          onClick={() => callService('input_boolean', 'toggle', undefined, { entity_id: HOME.partyMode })}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold transition-all ${party?.state === 'on' ? 'bg-pink-500 text-white shadow-lg shadow-pink-200' : 'bg-white border border-slate-200 text-slate-600'}`}
        >
          <HomeIcons.Party className="w-5 h-5" /> Party mode {party?.state === 'on' ? 'on' : 'off'}
        </button>
        <button
          disabled={!anyOn}
          onClick={() => callService('light', 'turn_off', undefined, { entity_id: HOME.rooms.map(r => r.entity) })}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold bg-slate-900 text-white disabled:opacity-30"
        >
          <HomeIcons.Power className="w-5 h-5" /> All off
        </button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {HOME.rooms.map(r => <RoomCard key={r.id} name={r.name} entityId={r.entity} />)}
      </div>
    </div>
  );
};

export default LightsView;
