import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Plus, LayoutGrid, Move, MousePointer,
  UserPlus, X, Trash2, Grid, HelpCircle, AlertTriangle, Printer, Copy, Download
} from 'lucide-react';

export interface Student {
  id: string;
  name: string;
}

export interface TableBlock {
  id: string;
  x: number;
  y: number;
  student_id: string | null;
}

export interface SeatingChart {
  id: string;
  name: string;
  blocks: TableBlock[];
}

export interface ClassRoom {
  id: string;
  name: string;
  students: Student[];
  seating_chart: SeatingChart;
}

const BLOCK_SIZE = 55;

export default function App() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const [newClassName, setNewClassName] = useState('');
  const [newStudentName, setNewStudentName] = useState('');

  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    const seen = localStorage.getItem('klassekart_seen_tutorial');
    return seen !== 'true';
  });

  const [showExportModal, setShowExportModal] = useState(false);

  const [snapToGridEnabled, setSnapToGridEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('klassekart_snap_grid');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCluster, setDragCluster] = useState<{ id: string; startX: number; startY: number; clusterOffsets: { id: string; offsetX: number; offsetY: number }[] } | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    localStorage.setItem('klassekart_snap_grid', JSON.stringify(snapToGridEnabled));
  }, [snapToGridEnabled]);

  const loadClasses = async () => {
    try {
      const res: ClassRoom[] = await invoke('get_classes');
      setClasses(res || []);
      if (res && res.length > 0 && !selectedClassId) {
        setSelectedClassId(res[0].id);
      }
    } catch (e) {
      console.error('Failed to load classes:', e);
    }
  };

  const saveClassesToBackend = async (updatedClasses: ClassRoom[]) => {
    setClasses(updatedClasses);
    try {
      await invoke('save_classes', { classes: updatedClasses });
    } catch (e) {
      console.error('Failed to save classes:', e);
    }
  };

  const currentClass = classes.find((c) => c.id === selectedClassId) || null;
  const currentChart = currentClass?.seating_chart || null;

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const newClass: ClassRoom = {
      id: 'class-' + Date.now(),
      name: newClassName.trim(),
      students: [],
      seating_chart: {
        id: 'chart-' + Date.now(),
        name: 'Klasserom',
        blocks: []
      },
    };
    const updated = [...classes, newClass];
    saveClassesToBackend(updated);
    setSelectedClassId(newClass.id);
    setNewClassName('');
  };

  const handleAddStudent = () => {
    if (!selectedClassId || !newStudentName.trim()) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        return {
          ...c,
          students: [...c.students, { id: 'std-' + Date.now(), name: newStudentName.trim() }],
        };
      }
      return c;
    });
    saveClassesToBackend(updated);
    setNewStudentName('');
  };

  const handleRemoveStudent = (stdId: string) => {
    if (!selectedClassId) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        const updatedBlocks = c.seating_chart.blocks.map((blk) =>
          blk.student_id === stdId ? { ...blk, student_id: null } : blk
        );
        return {
          ...c,
          students: c.students.filter((s) => s.id !== stdId),
          seating_chart: { ...c.seating_chart, blocks: updatedBlocks },
        };
      }
      return c;
    });
    saveClassesToBackend(updated);
  };

  const updateCurrentChart = (updater: (chart: SeatingChart) => SeatingChart) => {
    if (!selectedClassId) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        return {
          ...c,
          seating_chart: updater(c.seating_chart),
        };
      }
      return c;
    });
    saveClassesToBackend(updated);
  };

  const handleAddBlocks = (count: number) => {
    if (!currentChart) return;
    const startX = 80 + (currentChart.blocks.length % 5) * 80;
    const startY = 80 + Math.floor(currentChart.blocks.length / 5) * 80;

    const newBlocks: TableBlock[] = [];
    for (let i = 0; i < count; i++) {
      let bx = startX + (i * BLOCK_SIZE);
      let by = startY;

      if (snapToGridEnabled) {
        bx = Math.round(bx / BLOCK_SIZE) * BLOCK_SIZE;
        by = Math.round(by / BLOCK_SIZE) * BLOCK_SIZE;
      }

      newBlocks.push({
        id: 'blk-' + Date.now() + '-' + i,
        x: bx,
        y: by,
        student_id: null,
      });
    }

    updateCurrentChart((chart) => ({
      ...chart,
      blocks: [...chart.blocks, ...newBlocks],
    }));
  };

  const handleDeleteBlock = (blockId: string) => {
    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.filter(b => b.id !== blockId),
    }));
    setActiveBlockId(null);
  };

  const handleClearAllBlocks = () => {
    if (!window.confirm('Er du sikker på at du vil slette alle pulter i dette klasserommet?')) return;
    updateCurrentChart((chart) => ({
      ...chart,
      blocks: [],
    }));
    setActiveBlockId(null);
  };

  const handleWipeAllAppData = () => {
    if (!window.confirm('⚠️ ADVARSEL: Dette sletter ALLE klasser, elevlister og kart permanent! Er du helt sikker?')) return;
    if (!window.confirm('Siste sjanse: Er du 100% sikker på at du vil nullstille hele appen?')) return;

    saveClassesToBackend([]);
    setSelectedClassId(null);
    localStorage.clear();
    setShowTutorial(true);
  };

  const handleDetachBlock = (blockId: string) => {
    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.map(b => {
        if (b.id === blockId) {
          return { ...b, x: b.x + 25, y: b.y + 25 };
        }
        return b;
      }),
    }));
  };

  const getClusterBlockIds = (startId: string, blocks: TableBlock[]): string[] => {
    const visited = new Set<string>();
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const curr = blocks.find(b => b.id === currId);
      if (!curr) continue;

      for (const other of blocks) {
        if (visited.has(other.id)) continue;
        const isAdjacent =
          (Math.abs(curr.x - other.x) === BLOCK_SIZE && curr.y === other.y) ||
          (Math.abs(curr.y - other.y) === BLOCK_SIZE && curr.x === other.x);

        if (isAdjacent) {
          visited.add(other.id);
          queue.push(other.id);
        }
      }
    }
    return Array.from(visited);
  };

  const handleDragStop = (clusterIds: string[]) => {
    setIsDragging(false);
    setDragCluster(null);
    if (!currentChart) return;

    const SNAP_THRESHOLD = 35;
    let snapOffsetX = 0;
    let snapOffsetY = 0;
    let foundSnap = false;

    const clusterBlocks = currentChart.blocks.filter(b => clusterIds.includes(b.id));
    const otherBlocks = currentChart.blocks.filter(b => !clusterIds.includes(b.id));

    for (const cb of clusterBlocks) {
      if (foundSnap) break;
      for (const ob of otherBlocks) {
        if (Math.abs(cb.x - (ob.x + BLOCK_SIZE)) < SNAP_THRESHOLD && Math.abs(cb.y - ob.y) < SNAP_THRESHOLD) {
          snapOffsetX = (ob.x + BLOCK_SIZE) - cb.x;
          snapOffsetY = ob.y - cb.y;
          foundSnap = true;
          break;
        }
        else if (Math.abs((cb.x + BLOCK_SIZE) - ob.x) < SNAP_THRESHOLD && Math.abs(cb.y - ob.y) < SNAP_THRESHOLD) {
          snapOffsetX = (ob.x - BLOCK_SIZE) - cb.x;
          snapOffsetY = ob.y - cb.y;
          foundSnap = true;
          break;
        }
        else if (Math.abs(cb.y - (ob.y + BLOCK_SIZE)) < SNAP_THRESHOLD && Math.abs(cb.x - ob.x) < SNAP_THRESHOLD) {
          snapOffsetX = ob.x - cb.x;
          snapOffsetY = (ob.y + BLOCK_SIZE) - cb.y;
          foundSnap = true;
          break;
        }
        else if (Math.abs((cb.y + BLOCK_SIZE) - ob.y) < SNAP_THRESHOLD && Math.abs(cb.x - ob.x) < SNAP_THRESHOLD) {
          snapOffsetX = ob.x - cb.x;
          snapOffsetY = (ob.y - BLOCK_SIZE) - cb.y;
          foundSnap = true;
          break;
        }
      }
    }

    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.map(b => {
        let newX = b.x;
        let newY = b.y;

        if (clusterIds.includes(b.id)) {
          if (foundSnap) {
            newX += snapOffsetX;
            newY += snapOffsetY;
          }
          if (snapToGridEnabled) {
            newX = Math.round(newX / BLOCK_SIZE) * BLOCK_SIZE;
            newY = Math.round(newY / BLOCK_SIZE) * BLOCK_SIZE;
          }
          return { ...b, x: newX, y: newY };
        }
        return b;
      })
    }));
  };

  const handleAssignStudent = (studentId: string | null) => {
    if (!activeBlockId || !currentChart) return;

    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.map((b) => {
        if (b.id === activeBlockId) {
          return { ...b, student_id: studentId };
        }
        if (studentId && b.student_id === studentId) {
          return { ...b, student_id: null };
        }
        return b;
      }),
    }));
    setActiveBlockId(null);
  };

  const getBorderRadiusStyle = (block: TableBlock, blocks: TableBlock[]) => {
    const tolerance = 5;
    const hasTop = blocks.some(b => Math.abs(b.x - block.x) < tolerance && Math.abs(b.y - (block.y - BLOCK_SIZE)) < tolerance);
    const hasBottom = blocks.some(b => Math.abs(b.x - block.x) < tolerance && Math.abs(b.y - (block.y + BLOCK_SIZE)) < tolerance);
    const hasLeft = blocks.some(b => Math.abs(b.y - block.y) < tolerance && Math.abs(b.x - (block.x - BLOCK_SIZE)) < tolerance);
    const hasRight = blocks.some(b => Math.abs(b.y - block.y) < tolerance && Math.abs(b.x - (block.x + BLOCK_SIZE)) < tolerance);

    const tl = hasTop || hasLeft ? '0px' : '8px';
    const tr = hasTop || hasRight ? '0px' : '8px';
    const br = hasBottom || hasRight ? '0px' : '8px';
    const bl = hasBottom || hasLeft ? '0px' : '8px';

    return `${tl} ${tr} ${br} ${bl}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyClipboard = async () => {
    if (!printAreaRef.current) return;
    try {
      // Vi lager en enkel tekstbasert oversikt til utklipstavlen
      let textSummary = `KLASSEKART: ${currentClass?.name || 'Klasse'}\n\n`;
      currentChart?.blocks.forEach((b, idx) => {
        const student = currentClass?.students.find(s => s.id === b.student_id);
        textSummary += `Pult ${idx + 1}: ${student ? student.name : 'Ledig'}\n`;
      });
      await navigator.clipboard.writeText(textSummary);
      alert('Klassekartet (tekstform) er kopiert til utklipstavlen!');
    } catch (err) {
      alert('Kunne ikke kopiere til utklipstavle.');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>

      {/* SIDEBAR */}
      <div style={{ width: '300px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LayoutGrid size={24} /> Klassekart
          </div>
          <button
            onClick={() => setShowTutorial(true)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Hjelp og veiledning"
          >
            <HelpCircle size={20} />
          </button>
        </div>

        {/* Klasser */}
        <div style={{ padding: '14px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>1. Velg Klasse</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="F.eks. 10B..."
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
            />
            <button onClick={handleAddClass} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
              <Plus size={16} /> Ny klasse
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassId(cls.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: cls.id === selectedClassId ? '#eff6ff' : 'transparent',
                  color: cls.id === selectedClassId ? '#1d4ed8' : '#334155',
                  border: cls.id === selectedClassId ? '1px solid #bfdbfe' : '1px solid transparent'
                }}
              >
                <span>{cls.name}</span>
                <span style={{ fontSize: '0.75rem', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '10px', color: '#475569' }}>{cls.students.length} elever</span>
              </button>
            ))}
          </div>
        </div>

        {/* Elevliste */}
        {currentClass && (
          <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>2. Elevliste ({currentClass.students.length})</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Elevens navn..."
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
              />
              <button onClick={handleAddStudent} style={{ backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                <UserPlus size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {currentClass.students.map((std) => (
                <div key={std.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '6px', color: '#1e293b', fontWeight: 500 }}>
                  <span>{std.name}</span>
                  <button onClick={() => handleRemoveStudent(std.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slett all appdata */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
          <button
            onClick={handleWipeAllAppData}
            style={{ width: '100%', backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <AlertTriangle size={14} /> Tilbakestill / Slett all appdata
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>

        {/* TOP BAR */}
        <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
            {currentClass ? `Klasserom: ${currentClass.name}` : 'Velg en klasse'}
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {currentClass && (
              <button
                onClick={() => setShowExportModal(true)}
                style={{ backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
              >
                <Printer size={16} /> Skriv ut / Lagre kart
              </button>
            )}

            <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '10px', gap: '4px' }}>
              <button
                onClick={() => { setMode('view'); setActiveBlockId(null); }}
                style={{ fontSize: '0.85rem', padding: '8px 16px', background: mode === 'view' ? '#ffffff' : 'transparent', color: mode === 'view' ? '#2563eb' : '#475569', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: mode === 'view' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                <MousePointer size={15} /> 1. Plassér Elever
              </button>
              <button
                onClick={() => { setMode('edit'); setActiveBlockId(null); }}
                style={{ fontSize: '0.85rem', padding: '8px 16px', background: mode === 'edit' ? '#ffffff' : 'transparent', color: mode === 'edit' ? '#2563eb' : '#475569', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: mode === 'edit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >
                <Move size={15} /> 2. Bygg / Flytt Pulter
              </button>
            </div>
          </div>
        </div>

        {/* EDIT TOOLBAR */}
        {mode === 'edit' && currentChart && (
          <div style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Legg til pulter:</span>

            <button onClick={() => handleAddBlocks(1)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              + 1 Pult
            </button>
            <button onClick={() => handleAddBlocks(2)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              + 2-pult
            </button>
            <button onClick={() => handleAddBlocks(3)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              + 3-pult
            </button>

            <div style={{ height: '24px', width: '2px', backgroundColor: '#cbd5e1', margin: '0 4px' }} />

            <button
              onClick={() => setSnapToGridEnabled(!snapToGridEnabled)}
              style={{
                backgroundColor: snapToGridEnabled ? '#059669' : '#475569',
                color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <Grid size={16} /> Snapp til rutenett: {snapToGridEnabled ? 'PÅ' : 'AV'}
            </button>

            <div style={{ flex: 1 }} />

            <button onClick={handleClearAllBlocks} style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={16} /> Slett alle pulter
            </button>
          </div>
        )}

        {/* CANVAS */}
        <div style={{ flex: 1, position: 'relative', overflow: 'auto', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {currentChart ? (
            <div
              onMouseMove={(e) => {
                if (!isDragging || mode !== 'edit' || !dragCluster) return;
                const canvasRect = e.currentTarget.getBoundingClientRect();
                const mouseX = e.clientX - canvasRect.left;
                const mouseY = e.clientY - canvasRect.top;

                let deltaX = mouseX - dragCluster.startX;
                let deltaY = mouseY - dragCluster.startY;

                updateCurrentChart((chart) => ({
                  ...chart,
                  blocks: chart.blocks.map((b) => {
                    const match = dragCluster.clusterOffsets.find(o => o.id === b.id);
                    if (match) {
                      let newX = Math.max(0, match.offsetX + deltaX);
                      let newY = Math.max(0, match.offsetY + deltaY);
                      return { ...b, x: newX, y: newY };
                    }
                    return b;
                  }),
                }));
              }}
              onMouseUp={() => {
                if (mode === 'edit' && dragCluster) {
                  handleDragStop(dragCluster.clusterOffsets.map(o => o.id));
                }
              }}
              style={{
                position: 'relative', width: '1050px', height: '680px', backgroundColor: '#ffffff', borderRadius: '12px', border: '2px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden',
                backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '20px 20px'
              }}
            >
              {currentChart.blocks.map((blk) => {
                const assignedStudent = currentClass?.students.find((s) => s.id === blk.student_id);
                const borderRadius = getBorderRadiusStyle(blk, currentChart.blocks);

                return (
                  <div
                    key={blk.id}
                    onMouseDown={(e) => {
                      if (mode !== 'edit') return;
                      const canvasRect = e.currentTarget.parentElement!.getBoundingClientRect();
                      const startX = e.clientX - canvasRect.left;
                      const startY = e.clientY - canvasRect.top;

                      const clusterIds = getClusterBlockIds(blk.id, currentChart.blocks);
                      const clusterOffsets = currentChart.blocks
                        .filter(b => clusterIds.includes(b.id))
                        .map(b => ({ id: b.id, offsetX: b.x, offsetY: b.y }));

                      setIsDragging(true);
                      setDragCluster({ id: blk.id, startX, startY, clusterOffsets });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (mode === 'edit') {
                        handleDeleteBlock(blk.id);
                      }
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (mode === 'edit') {
                        handleDetachBlock(blk.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mode === 'view') setActiveBlockId(blk.id);
                    }}
                    style={{
                      position: 'absolute', left: blk.x, top: blk.y, width: BLOCK_SIZE, height: BLOCK_SIZE,
                      borderRadius: borderRadius,
                      padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      cursor: mode === 'edit' ? 'grab' : 'pointer',
                      border: assignedStudent ? '2px solid #059669' : '2px solid #475569',
                      backgroundColor: assignedStudent ? '#ecfdf5' : '#ffffff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                      transition: isDragging ? 'none' : 'background-color 0.15s'
                    }}
                    title={mode === 'edit' ? 'Høyreklikk for å slette, dobbeltklikk for å ufeste' : ''}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '7px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Pult</span>
                      {mode === 'edit' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteBlock(blk.id); }}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0 }}
                          title="Slett pult"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', color: assignedStudent ? '#065f46' : '#64748b', fontStyle: assignedStudent ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assignedStudent ? assignedStudent.name : 'Ledig'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: '1rem', fontWeight: 600 }}>
              Opprett en klasse i menyen til venstre for å begynne.
            </div>
          )}

          {/* POPOVER FOR ELEVVALG */}
          {mode === 'view' && activeBlockId && currentClass && (
            <div style={{ position: 'absolute', right: '24px', top: '24px', width: '280px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '16px', zIndex: 50 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2563eb' }}>
                  Velg elev til denne pulten:
                </h3>
                <button onClick={() => setActiveBlockId(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                <button
                  onClick={() => handleAssignStudent(null)}
                  style={{ textAlign: 'left', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 700 }}
                >
                  Tom pult (Fjern elev)
                </button>

                {currentClass.students.map((std) => {
                  const isSeatedElsewhere = currentClass.seating_chart.blocks.some(
                    (b) => b.student_id === std.id && b.id !== activeBlockId
                  );

                  return (
                    <button
                      key={std.id}
                      onClick={() => handleAssignStudent(std.id)}
                      style={{
                        textAlign: 'left', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600
                      }}
                    >
                      <span>{std.name}</span>
                      {isSeatedElsewhere && <span style={{ fontSize: '10px', color: '#d97706', fontWeight: 700 }}>(Sitter alt)</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* UTSKRIFT / EKSPORT MODAL */}
      {showExportModal && currentClass && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ backgroundColor: '#ffffff', width: '700px', maxHeight: '90vh', borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                Utskriftsvisning: {currentClass.name}
              </h2>
              <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Forhåndsvisning av kartet */}
            <div ref={printAreaRef} style={{ flex: 1, backgroundColor: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: '12px', padding: '20px', minHeight: '350px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Klassekart - {currentClass.name}</h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Dato: {new Date().toLocaleDateString('no-NO')}</span>
              </div>

              <div style={{ position: 'relative', height: '300px', width: '100%' }}>
                {currentChart?.blocks.map((blk) => {
                  const assignedStudent = currentClass.students.find(s => s.id === blk.student_id);
                  const borderRadius = getBorderRadiusStyle(blk, currentChart.blocks);

                  return (
                    <div
                      key={'print-' + blk.id}
                      style={{
                        position: 'absolute',
                        left: `${blk.x * 0.75}px`,
                        top: `${blk.y * 0.75}px`,
                        width: `${BLOCK_SIZE * 0.75}px`,
                        height: `${BLOCK_SIZE * 0.75}px`,
                        borderRadius: borderRadius,
                        backgroundColor: assignedStudent ? '#ecfdf5' : '#ffffff',
                        border: assignedStudent ? '2px solid #059669' : '2px solid #475569',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '4px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: assignedStudent ? '#065f46' : '#1e293b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                        {assignedStudent ? assignedStudent.name : 'Ledig'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Handlingsknapper for eksport */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCopyClipboard}
                style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Copy size={16} /> Kopier tekstoversikt
              </button>
              <button
                onClick={handlePrint}
                style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={16} /> Skriv ut / Lagre som PDF
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FØRSTEGANGS-VEILEDNING (TUTORIAL) */}
      {showTutorial && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ backgroundColor: '#ffffff', width: '480px', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #cbd5e1' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginBottom: '12px' }}>
              Velkommen til Klassekart! 🎓
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5', marginBottom: '16px' }}>
              Her er en rask guide for å komme i gang på 1-2-3:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>1</div>
                <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                  <b>Opprett klasse & elever:</b> Skriv inn klassenavn i venstre meny, og legg til elevene i elevlisten.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>2</div>
                <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                  <b>Bygg klasserommet:</b> Gå til <i>«2. Bygg / Flytt Pulter»</i>. Legg til pulter (1, 2 eller 3 i rekke) og dra dem inntil hverandre for å forme klasserommet.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>3</div>
                <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                  <b>Plassér elever:</b> Gå til <i>«1. Plassér Elever»</i> og trykk på en pult for å plassere en elev. Høyreklikk på pulten for å slette den.
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowTutorial(false);
                localStorage.setItem('klassekart_seen_tutorial', 'true');
              }}
              style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Sett i gang!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}