import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Plus, LayoutGrid, Move, MousePointer,
  UserPlus, X, Trash2, Grid, HelpCircle, AlertTriangle, Printer, Copy,
  ArrowRight, ArrowLeft, CheckCircle2, Lock
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
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isInteractiveTutorial, setIsInteractiveTutorial] = useState<boolean>(() => {
    const seen = localStorage.getItem('klassekart_seen_tutorial');
    return seen !== 'true';
  });

  const [showExportModal, setShowExportModal] = useState(false);

  const [snapToGridEnabled, setSnapToGridEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('klassekart_snap_grid');
    return saved !== null ? JSON.parse(saved) : true;
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
    setIsInteractiveTutorial(true);
    setShowTutorial(true);
    setTutorialStep(0);
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

  const getTableBlockStyle = (block: TableBlock, blocks: TableBlock[] = [], isAssigned: boolean, isPrint = false) => {
    const list = blocks || [];
    const tolerance = 5;
    const size = BLOCK_SIZE;

    const hasTop = list.some(b => Math.abs(b.x - block.x) < tolerance && Math.abs(b.y - (block.y - size)) < tolerance);
    const hasBottom = list.some(b => Math.abs(b.x - block.x) < tolerance && Math.abs(b.y - (block.y + size)) < tolerance);
    const hasLeft = list.some(b => Math.abs(b.y - block.y) < tolerance && Math.abs(b.x - (block.x - size)) < tolerance);
    const hasRight = list.some(b => Math.abs(b.y - block.y) < tolerance && Math.abs(b.x - (block.x + size)) < tolerance);

    const tl = hasTop || hasLeft ? '0px' : '10px';
    const tr = hasTop || hasRight ? '0px' : '10px';
    const br = hasBottom || hasRight ? '0px' : '10px';
    const bl = hasBottom || hasLeft ? '0px' : '10px';

    const defaultColor = isPrint ? '#1d4ed8' : '#047857';
    const assignedColor = isPrint ? '#1d4ed8' : '#1d4ed8';
    const borderColor = isAssigned ? assignedColor : defaultColor;

    return {
      borderRadius: `${tl} ${tr} ${br} ${bl}`,
      borderTop: hasTop ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
      borderBottom: hasBottom ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
      borderLeft: hasLeft ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
      borderRight: hasRight ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
    };
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyClipboard = async () => {
    if (!printAreaRef.current) return;
    try {
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

  const tutorialSteps = [
    {
      title: "Velkommen til Klassekart! 🏫",
      desc: "Her kan du lage et digitalt oversiktskart over klasserommet ditt, holde styr på hvem som sitter hvor, og skrive ut arket på papir.",
      icon: <LayoutGrid size={48} color="#2563eb" />
    },
    {
      title: "Steg 1: Lag en klasse 📝",
      desc: "Se helt til venstre på skjermen:\n\n1. Klikk med musa i feltet der det står 'F.eks. 10B...'.\n2. Skriv navnet på klassen på tastaturet og trykk på den blå knappen 'Ny klasse'.\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <UserPlus size={48} color="#059669" />
    },
    {
      title: "Steg 2: Legg til en elev 👤",
      desc: "Se i sidepanelet til venstre under elevlisten:\n\n1. Skriv inn navnet på en elev.\n2. Trykk på den grønne knappen for å legge eleven til i listen.\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <UserPlus size={48} color="#059669" />
    },
    {
      title: "Steg 3: Bygg pulter 🪑",
      desc: "Se øverst på skjermen:\n\n1. Klikk på knappen 'Bygg / Flytt Pulter'.\n2. Trykk på f.eks. '+ 1 Pult' for å få en pult ut på det rutete feltet.\n3. Hvis du drar flere pulter inntil hverandre, kobler de seg automatisk sammen til større grupper!\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <Move size={48} color="#2563eb" />
    },
    {
      title: "Steg 4: Sette elev på pult 👤",
      desc: "Se øverst på skjermen:\n\n1. Klikk på knappen 'Plassér Elever'.\n2. Klikk med musa på pulten du lagde i stad.\n3. Klikk på elevens navn i menyen som dukker opp til høyre.\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <MousePointer size={48} color="#d97706" />
    },
    {
      title: "Steg 5: Skriv ut eller lagre PDF 🖨️",
      desc: "Når du er ferdig med å plassere elever:\n\n1. Klikk på den blå knappen 'Skriv ut / Lagre kart' helt øverst til høyre.\n2. Der kan du skrive ut arket på en fysisk skriver.",
      icon: <Printer size={48} color="#7c3aed" />
    }
  ];

  const isCurrentStepCompleted = () => {
    if (!isInteractiveTutorial) return true;
    if (tutorialStep === 0) return true;
    if (tutorialStep === 1) return classes.length > 0;
    if (tutorialStep === 2) return currentClass ? currentClass.students.length > 0 : false;
    if (tutorialStep === 3) return currentChart ? currentChart.blocks.length > 0 : false;
    if (tutorialStep === 4) return currentChart ? currentChart.blocks.some(b => b.student_id !== null) : false;
    if (tutorialStep === 5) return true;
    return true;
  };

  const isSideStep = tutorialStep === 3 || tutorialStep === 4;

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-area, #printable-area * {
            visibility: visible !important;
          }
          #printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: #ffffff !important;
            padding: 20px !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>

        <div style={{ width: '300px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LayoutGrid size={24} /> Klassekart
            </div>
            <button
              onClick={() => {
                setIsInteractiveTutorial(false);
                setTutorialStep(0);
                setShowTutorial(true);
              }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Hjelp og veiledning"
            >
              <HelpCircle size={20} />
            </button>
          </div>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Velg Klasse</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="F.eks. 10B..."
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a', outline: 'none', minWidth: 0 }}
              />
              <button onClick={handleAddClass} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
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

          {currentClass && (
            <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Elevliste ({currentClass.students.length})</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Elevens navn..."
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a', outline: 'none', minWidth: 0 }}
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

          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
            <button
              onClick={handleWipeAllAppData}
              style={{ width: '100%', backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <AlertTriangle size={14} /> Tilbakestill / Slett all appdata
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>

          <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              {currentClass ? `Klasserom: ${currentClass.name}` : 'Velg en klasse'}
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {currentClass && (
                <button
                  onClick={() => setShowExportModal(true)}
                  style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                >
                  <Printer size={16} /> Skriv ut / Lagre kart
                </button>
              )}

              <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                <button
                  onClick={() => { setMode('view'); setActiveBlockId(null); }}
                  style={{ fontSize: '0.85rem', padding: '8px 16px', background: mode === 'view' ? '#ffffff' : 'transparent', color: mode === 'view' ? '#2563eb' : '#475569', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: mode === 'view' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >
                  <MousePointer size={15} /> Plassér Elever
                </button>
                <button
                  onClick={() => { setMode('edit'); setActiveBlockId(null); }}
                  style={{ fontSize: '0.85rem', padding: '8px 16px', background: mode === 'edit' ? '#ffffff' : 'transparent', color: mode === 'edit' ? '#2563eb' : '#475569', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: mode === 'edit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >
                  <Move size={15} /> Bygg / Flytt Pulter
                </button>
              </div>
            </div>
          </div>

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
                        let newX = Math.max(12, match.offsetX + deltaX);
                        let newY = Math.max(12, match.offsetY + deltaY);
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
                  position: 'relative', width: '1050px', height: '680px', backgroundColor: '#f0f9ff', borderRadius: '16px', border: '2px solid #bae6fd', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)', overflow: 'hidden',
                  backgroundImage: 'radial-gradient(#38bdf8 1.5px, transparent 1.5px)', backgroundSize: '24px 24px'
                }}
              >
                {currentChart.blocks.map((blk) => {
                  const assignedStudent = currentClass?.students.find((s) => s.id === blk.student_id);
                  const blockStyle = getTableBlockStyle(blk, currentChart.blocks, !!assignedStudent, false);

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
                        ...blockStyle,
                        padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        cursor: mode === 'edit' ? 'grab' : 'pointer',
                        backgroundColor: assignedStudent ? '#2563eb' : '#10b981',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
                        transition: isDragging ? 'none' : 'background-color 0.15s'
                      }}
                      title={mode === 'edit' ? 'Høyreklikk for å slette, dobbeltklikk for å ufeste' : ''}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '7px', fontWeight: 800, color: assignedStudent ? '#93c5fd' : '#a7f3d0', textTransform: 'uppercase' }}>Pult</span>
                        {mode === 'edit' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBlock(blk.id); }}
                            style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0 }}
                            title="Slett pult"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    const activeBlock = currentClass.seating_chart.blocks.find(b => b.id === activeBlockId);
                    const isSeatedOnThisBlock = activeBlock?.student_id === std.id;
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
                        {isSeatedOnThisBlock && <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>Elev sitter på denne pulten</span>}
                        {!isSeatedOnThisBlock && isSeatedElsewhere && <span style={{ fontSize: '10px', color: '#d97706', fontWeight: 700 }}>(Sitter alt)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {showTutorial && (
          <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: isSideStep ? 'flex-start' : 'center', paddingLeft: isSideStep ? '40px' : '0px', zIndex: 200, transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', width: '500px', maxWidth: '90vw', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', pointerEvents: 'auto', border: '1px solid #cbd5e1', transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>

              <button
                onClick={() => {
                  setShowTutorial(false);
                  localStorage.setItem('klassekart_seen_tutorial', 'true');
                }}
                style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={22} />
              </button>

              <div style={{ marginBottom: '20px', backgroundColor: '#f0f9ff', padding: '20px', borderRadius: '50%' }}>
                {tutorialSteps[tutorialStep].icon}
              </div>

              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px', textAlign: 'center' }}>
                {tutorialSteps[tutorialStep].title}
              </h2>

              <div style={{ fontSize: '0.95rem', color: '#475569', textAlign: 'left', lineHeight: '1.6', marginBottom: '24px', padding: '0 10px', whiteSpace: 'pre-line', width: '100%' }}>
                {tutorialSteps[tutorialStep].desc}
              </div>

              {isInteractiveTutorial && !isCurrentStepCompleted() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d97706', fontSize: '0.85rem', fontWeight: 700, marginBottom: '16px', backgroundColor: '#fef3c7', padding: '8px 12px', borderRadius: '8px', width: '100%', justifyContent: 'center' }}>
                  <Lock size={15} /> Utfør handlingen i appen for å låse opp neste knappen!
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {tutorialSteps.map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: tutorialStep === idx ? '24px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: tutorialStep === idx ? '#2563eb' : '#cbd5e1',
                      transition: 'all 0.3s'
                    }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <button
                  onClick={() => setTutorialStep(prev => Math.max(0, prev - 1))}
                  disabled={tutorialStep === 0}
                  style={{
                    flex: 1, backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: tutorialStep === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: tutorialStep === 0 ? 0.5 : 1
                  }}
                >
                  <ArrowLeft size={16} /> Forrige
                </button>

                {tutorialStep < tutorialSteps.length - 1 ? (
                  <button
                    onClick={() => {
                      if (isCurrentStepCompleted()) {
                        setTutorialStep(prev => prev + 1);
                      }
                    }}
                    disabled={isInteractiveTutorial && !isCurrentStepCompleted()}
                    style={{
                      flex: 1,
                      backgroundColor: isInteractiveTutorial && !isCurrentStepCompleted() ? '#94a3b8' : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      cursor: isInteractiveTutorial && !isCurrentStepCompleted() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      opacity: isInteractiveTutorial && !isCurrentStepCompleted() ? 0.6 : 1
                    }}
                  >
                    Neste <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowTutorial(false);
                      localStorage.setItem('klassekart_seen_tutorial', 'true');
                    }}
                    style={{
                      flex: 1, backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    Start appen! <CheckCircle2 size={16} />
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  setShowTutorial(false);
                  localStorage.setItem('klassekart_seen_tutorial', 'true');
                }}
                style={{
                  marginTop: '12px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Hopp over veiledning
              </button>

            </div>
          </div>
        )}

        {showExportModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '1150px', maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>

              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Skriv ut eller lagre klassekart</h3>
                <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <div
                  ref={printAreaRef}
                  id="printable-area"
                  style={{
                    position: 'relative', width: '1050px', height: '680px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', padding: '20px'
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Klassekart: {currentClass?.name}</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Dato: {new Date().toLocaleDateString('nb-NO')}</p>
                  </div>
                  <div style={{ position: 'relative', width: '100%', height: '580px' }}>
                    {currentChart?.blocks.map((blk) => {
                      const assignedStudent = currentClass?.students.find((s) => s.id === blk.student_id);
                      const blockStyle = getTableBlockStyle(blk, currentChart.blocks, !!assignedStudent, true);
                      return (
                        <div
                          key={blk.id}
                          style={{
                            position: 'absolute', left: blk.x, top: blk.y, width: BLOCK_SIZE, height: BLOCK_SIZE,
                            ...blockStyle,
                            padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                            backgroundColor: '#2563eb',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          }}
                        >
                          <span style={{ fontSize: '7px', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>Pult</span>
                          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {assignedStudent ? assignedStudent.name : 'Ledig'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#ffffff' }}>
                <button
                  onClick={handleCopyClipboard}
                  style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={16} /> Kopier som tekst
                </button>
                <button
                  onClick={handlePrint}
                  style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={16} /> Skriv ut / PDF
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </>
  );
}